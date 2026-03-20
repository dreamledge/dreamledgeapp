import { useEffect, useState } from 'react';
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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    // Fallback timeout to ensure loading state is cleared
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        clearTimeout(timeoutId);
        setUser(firebaseUser);
        
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }

        if (firebaseUser) {
          // Check if profile exists, if not create it
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
            // Set initial profile data
            setProfile(profileSnap.data() as UserProfile);
            
            // Listen for profile changes
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
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return { user, profile, loading };
}
