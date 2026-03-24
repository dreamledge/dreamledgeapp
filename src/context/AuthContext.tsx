import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export interface UserProfile {
  uid: string;
  username: string;
  photoURL: string;
  bio: string;
  stats: {
    wins: number;
    losses: number;
    ranking: number;
  };
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 8000); // Increased timeout for safety

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser);
        
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }

        if (firebaseUser) {
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          if (!profileSnap.exists()) {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              username: firebaseUser.displayName || `User_${firebaseUser.uid.slice(0, 5)}`,
              photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
              bio: "New to the Arena",
              stats: { wins: 0, losses: 0, ranking: 1000 }
            };
            await setDoc(profileRef, newProfile);
            setProfile(newProfile);
          } else {
            setProfile(profileSnap.data() as UserProfile);
            
            unsubProfile = onSnapshot(profileRef, (doc) => {
              if (doc.exists()) {
                setProfile(doc.data() as UserProfile);
              }
            }, (error) => {
              handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            });
          }
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Auth state change error:", error);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
