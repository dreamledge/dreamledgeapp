import React, { useState } from 'react';
import { Grid } from '@giphy/react-components';
import { GiphyFetch } from '@giphy/js-fetch-api';
import { Search, X } from 'lucide-react';
import { motion } from 'motion/react';

const gf = new GiphyFetch((import.meta as any).env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC');

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [search, setSearch] = useState('');

  const fetchGifs = (offset: number) => {
    if (search) {
      return gf.search(search, { offset, limit: 10 });
    }
    return gf.trending({ offset, limit: 10 });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="w-full md:w-[400px] h-[300px] md:h-[400px] bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-[100] backdrop-blur-2xl"
    >
      <div className="p-2 md:p-4 border-b border-white/5 flex items-center gap-2 md:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 h-4 text-zinc-500" />
          <input 
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full bg-white/5 border border-white/5 rounded-xl pl-8 md:pl-10 pr-4 py-1 md:py-2 text-[9px] md:text-xs font-bold focus:ring-1 focus:ring-red-600 outline-none"
          />
        </div>
        <button onClick={onClose} className="p-1 md:p-2 hover:bg-white/5 rounded-xl transition-colors">
          <X className="w-3 h-3 md:w-4 h-4 text-zinc-500" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1 md:p-4 no-scrollbar">
        <Grid
          key={search}
          onGifClick={(gif, e) => {
            e.preventDefault();
            onSelect(gif.images.fixed_height.url);
          }}
          fetchGifs={fetchGifs}
          width={window.innerWidth < 768 ? window.innerWidth - 64 : 360}
          columns={2}
          gutter={8}
        />
      </div>
    </motion.div>
  );
}
