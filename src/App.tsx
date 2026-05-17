/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, Trophy, Lightbulb, Pause, Play, ChevronLeft, RefreshCw } from 'lucide-react';

const WORD_BANKS: Record<string, string[]> = {
  animals: ["TIGER", "GIRAFFE", "PANDA", "ELEPHANT", "ZEBRA", "LEOPARD", "DOLPHIN", "HAMSTER"],
  tech: ["REACT", "PYTHON", "GITHUB", "MOBILE", "PIXEL", "ENGINE", "BROWSER", "CURSOR"],
  food: ["PIZZA", "BURGER", "SUSHI", "PASTA", "WAFFLE", "CHERRY", "BANANA", "STEAK"]
};

type Difficulty = 'easy' | 'medium' | 'hard';
type Screen = 'main-menu' | 'game-screen' | 'result-screen';
type CellPos = { r: number; c: number };

const CONFIGS: Record<Difficulty, { size: number; count: number }> = {
  easy: { size: 8, count: 5 },
  medium: { size: 12, count: 8 },
  hard: { size: 16, count: 12 }
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('main-menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [gridSize, setGridSize] = useState(8);
  const [grid, setGrid] = useState<string[][]>([]);
  const [wordsToFind, setWordsToFind] = useState<string[]>([]);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundPaths, setFoundPaths] = useState<CellPos[][]>([]);
  const [category, setCategory] = useState('');
  const [score, setScore] = useState(0);
  const [hints, setHints] = useState(3);
  const [time, setTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startCell, setStartCell] = useState<CellPos | null>(null);
  const [currentCell, setCurrentCell] = useState<CellPos | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Store word locations for hints and rendering
  const [wordLocations, setWordLocations] = useState<Record<string, CellPos[]>>({});

  // --- Game Initialization ---

  const generateGrid = useCallback((size: number, words: string[]) => {
    const newGrid = Array(size).fill(null).map(() => Array(size).fill(''));
    const locations: Record<string, CellPos[]> = {};

    const canPlace = (word: string, row: number, col: number, dr: number, dc: number) => {
      for (let i = 0; i < word.length; i++) {
        const r = row + i * dr;
        const c = col + i * dc;
        if (r < 0 || r >= size || c < 0 || c >= size) return false;
        if (newGrid[r][c] !== '' && newGrid[r][c] !== word[i]) return false;
      }
      return true;
    };

    const place = (word: string, row: number, col: number, dr: number, dc: number) => {
      const path: CellPos[] = [];
      for (let i = 0; i < word.length; i++) {
        const r = row + i * dr;
        const c = col + i * dc;
        newGrid[r][c] = word[i];
        path.push({ r, c });
      }
      locations[word] = path;
    };

    const directions = [
      [0, 1], [1, 0], [1, 1], [-1, 1],
      [0, -1], [-1, 0], [-1, -1], [1, -1]
    ];

    words.forEach(word => {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 100) {
        const [dr, dc] = directions[Math.floor(Math.random() * (size > 12 ? directions.length : 4))];
        const row = Math.floor(Math.random() * size);
        const col = Math.floor(Math.random() * size);

        if (canPlace(word, row, col, dr, dc)) {
          place(word, row, col, dr, dc);
          placed = true;
        }
        attempts++;
      }
    });

    // Fill empty
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (newGrid[r][c] === '') {
          newGrid[r][c] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        }
      }
    }
    return { grid: newGrid, locations };
  }, []);

  const startGame = (diff: Difficulty) => {
    const config = CONFIGS[diff];
    setDifficulty(diff);
    setGridSize(config.size);
    
    // Choose category and words
    const cats = Object.keys(WORD_BANKS);
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const words = [...WORD_BANKS[cat]]
      .sort((a, b) => b.length - a.length) // Longest first for density
      .slice(0, config.count);

    setCategory(cat);
    setWordsToFind(words);
    setFoundWords([]);
    setFoundPaths([]);
    setScore(0);
    setHints(3);
    setTime(0);
    setIsPaused(false);
    
    const { grid: newGrid, locations } = generateGrid(config.size, words);
    setGrid(newGrid);
    setWordLocations(locations);
    setScreen('game-screen');
  };

  // --- Timer ---

  useEffect(() => {
    if (screen === 'game-screen' && !isPaused) {
      timerRef.current = setInterval(() => {
        setTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, isPaused]);

  // --- Interaction ---

  const getCellFromEvent = (e: React.PointerEvent | PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.classList.contains('letter-cell')) {
      return {
        r: parseInt(el.getAttribute('data-row') || '0'),
        c: parseInt(el.getAttribute('data-col') || '0')
      };
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPaused) return;
    const pos = getCellFromEvent(e);
    if (pos) {
      setIsSelecting(true);
      setStartCell(pos);
      setCurrentCell(pos);
    }
  };

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isSelecting || isPaused) return;
    const pos = getCellFromEvent(e);
    if (pos && (pos.r !== currentCell?.r || pos.c !== currentCell?.c)) {
      setCurrentCell(pos);
    }
  }, [isSelecting, isPaused, currentCell]);

  const handlePointerUp = useCallback(() => {
    if (!isSelecting) return;
    setIsSelecting(false);
    checkSelection();
    setStartCell(null);
    setCurrentCell(null);
  }, [isSelecting, startCell, currentCell]);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const checkSelection = () => {
    if (!startCell || !currentCell) return;
    const word = getSelectedWordStr();
    const reversed = word.split('').reverse().join('');
    
    const foundIndex = wordsToFind.findIndex(w => w === word || w === reversed);
    if (foundIndex !== -1 && !foundWords.includes(wordsToFind[foundIndex])) {
      const matched = wordsToFind[foundIndex];
      setFoundWords(prev => [...prev, matched]);
      setFoundPaths(prev => [...prev, getSelectedPath()]);
      setScore(prev => prev + 100);
    }
  };

  const getSelectedPath = () => {
    if (!startCell || !currentCell) return [];
    const dr = Math.sign(currentCell.r - startCell.r);
    const dc = Math.sign(currentCell.c - startCell.c);
    const distR = Math.abs(currentCell.r - startCell.r);
    const distC = Math.abs(currentCell.c - startCell.c);
    if (distR !== 0 && distC !== 0 && distR !== distC) return [];

    const path: CellPos[] = [];
    let r = startCell.r;
    let c = startCell.c;
    const steps = Math.max(distR, distC);
    for (let i = 0; i <= steps; i++) {
      path.push({ r, c });
      r += dr;
      c += dc;
    }
    return path;
  };

  const getSelectedWordStr = () => {
    const path = getSelectedPath();
    return path.map(p => grid[p.r][p.c]).join('');
  };

  // --- Canvas Drawing ---

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawLine = (s: CellPos, e: CellPos, color: string) => {
      const startEl = document.querySelector(`[data-row="${s.r}"][data-col="${s.c}"]`);
      const endEl = document.querySelector(`[data-row="${e.r}"][data-col="${e.c}"]`);
      const gridEl = gridRef.current;
      if (!startEl || !endEl || !gridEl) return;

      const rectS = startEl.getBoundingClientRect();
      const rectE = endEl.getBoundingClientRect();
      const gridRect = gridEl.getBoundingClientRect();

      ctx.beginPath();
      ctx.lineWidth = rectS.width * 0.8;
      ctx.lineCap = "round";
      ctx.strokeStyle = color;

      const x1 = rectS.left - gridRect.left + rectS.width / 2;
      const y1 = rectS.top - gridRect.top + rectS.height / 2;
      const x2 = rectE.left - gridRect.left + rectE.width / 2;
      const y2 = rectE.top - gridRect.top + rectE.height / 2;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    // Draw persistent lines for found words
    // Note: To draw found words, we'd need their start/end positions saved.
    // For now, let's just highlight the cells.

    // Draw current selection
    if (startCell && currentCell) {
      drawLine(startCell, currentCell, "rgba(56, 189, 248, 0.4)");
    }
  }, [startCell, currentCell, gridSize]);

  useEffect(() => {
    if (gridRef.current && canvasRef.current) {
      canvasRef.current.width = gridRef.current.clientWidth;
      canvasRef.current.height = gridRef.current.clientHeight;
    }
  }, [grid, screen]);

  // Check victory
  useEffect(() => {
    if (wordsToFind.length > 0 && foundWords.length === wordsToFind.length) {
      setTimeout(() => setScreen('result-screen'), 500);
    }
  }, [foundWords, wordsToFind]);

  // --- Helpers ---

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const isCellInFoundWord = (r: number, c: number) => {
    return foundPaths.some(path => path.some(p => p.r === r && p.c === c));
  };

  const useHint = () => {
    if (hints <= 0 || isPaused) return;
    const remaining = wordsToFind.filter(w => !foundWords.includes(w));
    if (remaining.length === 0) return;
    
    const wordToHint = remaining[Math.floor(Math.random() * remaining.length)];
    setFoundWords(prev => [...prev, wordToHint]);
    if (wordLocations[wordToHint]) {
      setFoundPaths(prev => [...prev, wordLocations[wordToHint]]);
    }
    setHints(prev => prev - 1);
    setScore(prev => Math.max(0, prev - 50));
  };

  return (
    <div className="w-full h-full flex justify-center items-center overflow-hidden bg-slate-950 font-sans">
      <AnimatePresence mode="wait">
        {screen === 'main-menu' && (
          <motion.section
            key="menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="screen active flex flex-row"
          >
            {/* Minimal left rail for menu too */}
            <div className="w-24 border-r border-slate-800 flex flex-col items-center justify-between py-10 bg-slate-900/50">
              <div className="w-12 h-12 bg-sky-500 rounded-full flex items-center justify-center font-black text-slate-950 text-xl shadow-[0_0_20px_rgba(56,189,248,0.4)]">L</div>
              <div className="text-xs font-mono text-slate-600 rotate-180 [writing-mode:vertical-rl]">V 2.0.4</div>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center text-center p-20">
              <h1 className="text-8xl font-black mb-12 tracking-tighter leading-none">
                LEXI<span className="text-sky-500">SEARCH</span>
              </h1>
              <div className="w-full max-w-md space-y-4">
                <button onClick={() => startGame('easy')} className="btn-menu w-full group">
                  <div className="flex justify-between items-center">
                    <div>
                      EASY 
                      <span>8x8 • RELAXED • NO TIMER</span>
                    </div>
                    <Trophy className="text-slate-700 group-hover:text-sky-950 transition-colors" />
                  </div>
                </button>
                <button onClick={() => startGame('medium')} className="btn-menu w-full group">
                  <div className="flex justify-between items-center">
                    <div>
                      MEDIUM 
                      <span>12x12 • BALANCED</span>
                    </div>
                    <Timer className="text-slate-700 group-hover:text-sky-950 transition-colors" />
                  </div>
                </button>
                <button onClick={() => startGame('hard')} className="btn-menu w-full group">
                  <div className="flex justify-between items-center">
                    <div>
                      HARD 
                      <span>16x16 • EXPERT</span>
                    </div>
                    <RefreshCw className="text-slate-700 group-hover:text-sky-950 transition-colors" />
                  </div>
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {screen === 'game-screen' && (
          <motion.section
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="screen active flex flex-row"
          >
            {/* Left Vertical Rail */}
            <div className="w-24 border-r border-slate-800 flex flex-col items-center justify-between py-10 bg-slate-900/50">
              <div className="flex flex-col gap-8 items-center">
                <div onClick={() => setScreen("main-menu")} className="w-12 h-12 bg-sky-500 rounded-full flex items-center justify-center font-black text-slate-950 text-xl shadow-[0_0_20px_rgba(56,189,248,0.4)] cursor-pointer hover:scale-110 transition-transform">L</div>
                <div className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-black tracking-[0.4em] uppercase text-slate-500">SESSION {Math.floor(Math.random()*9999)}-X</div>
              </div>
              <div className="text-xs font-mono text-slate-600 uppercase">V 2.0.4</div>
            </div>

            {/* Main Gameplay Area */}
            <main className="flex-1 flex flex-col p-8 relative">
              {/* Top HUD */}
              <div className="flex justify-between items-end mb-8">
                <div className="flex gap-12 items-end">
                  <h1 className="text-4xl font-black tracking-tighter mb-[-4px] mr-4">
                    LEXI<span className="text-sky-500">SEARCH</span>
                  </h1>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500 mb-1">Current Category</p>
                    <h2 className="text-2xl font-black tracking-tight uppercase">{category}</h2>
                  </div>
                  <div className="h-10 w-[1px] bg-slate-800"></div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Difficulty</p>
                    <h2 className="text-2xl font-black tracking-tight uppercase">
                      {difficulty} 
                      <span className="text-xs text-slate-600 ml-2">{gridSize}x{gridSize}</span>
                    </h2>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="bg-slate-900 border border-slate-800 px-6 py-2 rounded-xl text-center min-w-[120px]">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">TIMER</p>
                    <p className="text-xl font-mono font-bold text-amber-400 leading-none mt-1">{formatTime(time)}</p>
                  </div>
                  <div className="bg-sky-500 px-6 py-2 rounded-xl text-center shadow-[0_4px_15px_rgba(56,189,248,0.3)] min-w-[120px]">
                    <p className="text-[10px] font-bold text-sky-950 uppercase tracking-widest">Score</p>
                    <p className="text-xl font-mono font-bold text-sky-950 italic leading-none mt-1">{score.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* The Grid */}
              <div className="flex-1 flex items-center justify-center relative">
                <div 
                  ref={gridRef}
                  id="grid-container" 
                  className="relative glass-card p-4 rounded-2xl shadow-2xl backdrop-blur-sm group border border-slate-800 max-h-[500px] aspect-square w-full"
                  onPointerDown={handlePointerDown}
                >
                  <canvas 
                    ref={canvasRef}
                    className="absolute top-0 left-0 pointer-events-none z-10"
                  />
                  <div 
                    className="grid h-full"
                    style={{ 
                      gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                      gap: gridSize > 12 ? '2px' : '4px'
                    }}
                  >
                    {grid.map((row, r) => (
                      row.map((char, c) => (
                        <div
                          key={`${r}-${c}`}
                          data-row={r}
                          data-col={c}
                          className={`letter-cell flex items-center justify-center font-black rounded-md transition-all select-none
                          ${gridSize > 12 ? 'text-[10px]' : gridSize > 8 ? 'text-sm' : 'text-xl'}
                          ${foundWords.some(w => isCellInFoundWord(r, c)) ? 'bg-emerald-500 text-emerald-950 animate-pop' : 'text-slate-400 hover:bg-slate-800/50'}
                        `}
                        >
                          {char}
                        </div>
                      ))
                    ))}
                  </div>

                  {isPaused && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-30 flex flex-col items-center justify-center rounded-2xl">
                      <h2 className="text-5xl font-black mb-8 tracking-tighter">PAUSED</h2>
                      <button 
                        onClick={() => setIsPaused(false)}
                        className="bg-sky-500 text-sky-950 font-black px-10 py-4 rounded-xl flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-2xl"
                      >
                        <Play size={24} fill="currentColor" /> RESUME SESSION
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action Bar */}
              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-900">
                <div className="flex gap-4 items-center">
                  <button 
                    onClick={() => setIsPaused(!isPaused)}
                    className="px-6 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2"
                  >
                    {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button 
                    onClick={() => startGame(difficulty)}
                    className="px-6 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors"
                  >
                    Reset Grid
                  </button>
                </div>
                <div className="flex gap-3 items-center">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse"></div>
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">System Operational</p>
                </div>
              </div>
            </main>

            {/* Right Sidebar: Word List */}
            <div className="w-80 border-l border-slate-800 flex flex-col bg-slate-900/30">
              <div className="p-8 pb-4 flex-1 overflow-hidden flex flex-col">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6">Search Protocols</h3>
                <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                  {wordsToFind.map((word, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        opacity: foundWords.includes(word) ? 0.6 : 1,
                        x: foundWords.includes(word) ? 5 : 0
                      }}
                      className={`flex items-center justify-between p-3 border rounded-xl transition-all
                        ${foundWords.includes(word) 
                          ? 'bg-emerald-500/10 border-emerald-500/30' 
                          : 'bg-slate-800/40 border-slate-800'
                        }
                      `}
                    >
                      <span className={`font-black tracking-wider uppercase ${foundWords.includes(word) ? 'text-emerald-400 line-through' : 'text-slate-300'}`}>
                        {word}
                      </span>
                      {foundWords.includes(word) ? (
                        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-emerald-950" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                          </svg>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">
                          {word.length} LTRS
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="p-8">
                <div className="bg-slate-800/40 border border-slate-700 p-6 rounded-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tactical Aid</span>
                    <span className="text-[10px] font-black text-sky-500 uppercase tracking-widest">REMAINING: {hints.toString().padStart(2, '0')}</span>
                  </div>
                  <button 
                    onClick={useHint}
                    disabled={hints <= 0 || isPaused}
                    className={`w-full py-4 text-sky-950 font-black rounded-xl transition-all flex items-center justify-center gap-2
                      ${hints > 0 && !isPaused ? 'bg-sky-500 hover:bg-sky-400 shadow-[0_10px_20px_rgba(56,189,248,0.2)] active:scale-95' : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'}
                    `}
                  >
                    <Lightbulb size={20} fill="currentColor" /> USE HINT
                  </button>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {screen === 'result-screen' && (
          <motion.section
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="screen active flex items-center justify-center bg-slate-950"
          >
            <div className="glass-card p-12 rounded-[40px] w-full max-w-xl text-center relative overflow-hidden border-slate-800">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-sky-500 via-emerald-500 to-amber-400"></div>
              
              <div className="w-24 h-24 bg-sky-500/10 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(56,189,248,0.15)] border border-sky-500/20">
                <Trophy size={48} className="text-sky-500" />
              </div>
              
              <h2 className="text-6xl font-black mb-2 tracking-tighter uppercase leading-none">PROTOCOL<br/><span className="text-sky-500">COMPLETE</span></h2>
              <p className="text-slate-500 text-[10px] mb-10 uppercase tracking-[0.5em] font-black">Archive Session Sync Successful</p>
              
              <div className="grid grid-cols-2 gap-6 mb-12">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-inner">
                  <span className="block text-[10px] text-sky-500 font-black mb-2 uppercase tracking-widest">Final Yield</span>
                  <span className="text-4xl font-black font-mono tracking-tight">{score.toLocaleString()}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-inner">
                  <span className="block text-[10px] text-sky-500 font-black mb-2 uppercase tracking-widest">Time Elapsed</span>
                  <span className="text-4xl font-black font-mono tracking-tight">{formatTime(time)}</span>
                </div>
              </div>
              
              <button 
                onClick={() => setScreen('main-menu')}
                className="w-full bg-sky-500 text-sky-950 font-black py-5 rounded-2xl hover:bg-sky-400 hover:scale-[1.02] active:scale-98 transition-all shadow-[0_20px_40px_rgba(56,189,248,0.2)] flex items-center justify-center gap-3 text-lg"
              >
                INITIATE NEW SESSION
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

