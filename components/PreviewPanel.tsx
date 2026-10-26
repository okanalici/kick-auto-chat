import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Crosshair, X, CheckCircle, Upload } from 'lucide-react';

import { KICK_EMOJIS } from '../data/emotes';

type TabMode = 'list' | 'single' | 'emoji';

const validIntervals = (min: number, max: number) => Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max <= 86400 && min <= max;

const PreviewPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('list');
  const [logs, setLogs] = useState<string[]>([]);
  
  // Message Contents
  const [listMessages, setListMessages] = useState("W Streamer\nGG!\nL Take");
  const [singleMessage, setSingleMessage] = useState("W Streamer");
  
  // Timer State
  const [minTime, setMinTime] = useState(30);
  const [maxTime, setMaxTime] = useState(60);

  // Sequential State
  const [isSequential, setIsSequential] = useState(false);
  const seqIndex = useRef(0);
  const simulationSettings = useRef({ activeTab, selectedEmoji: 'emojiAngel', listMessages, singleMessage, isSequential, minTime, maxTime });

  // Emoji State
  const [selectedEmoji, setSelectedEmoji] = useState('emojiAngel');

  // Selection Logic States
  const [targetSet, setTargetSet] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hoveringDummy, setHoveringDummy] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReader = useRef<FileReader | null>(null);

  useEffect(() => () => {
    const reader = fileReader.current;
    fileReader.current = null;
    reader?.abort();
  }, []);

  useEffect(() => {
    simulationSettings.current = { activeTab, selectedEmoji, listMessages, singleMessage, isSequential, minTime, maxTime };
  }, [activeTab, selectedEmoji, listMessages, singleMessage, isSequential, minTime, maxTime]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const loop = () => {
      const settings = simulationSettings.current;
      if (!validIntervals(settings.minTime, settings.maxTime)) {
        setIsRunning(false);
        return;
      }
      let msg = '';
      if (settings.activeTab === 'emoji') {
        const emoji = KICK_EMOJIS.find(e => e.name === settings.selectedEmoji);
        if (emoji) msg = `emoji:${emoji.url}`;
      } else if (settings.activeTab === 'single') {
        msg = settings.singleMessage.trim();
      } else {
        const list = settings.listMessages.split(/\r?\n/).map(m => m.trim()).filter(Boolean);
        if (list.length > 0) {
          msg = settings.isSequential
            ? list[seqIndex.current % list.length]
            : list[Math.floor(Math.random() * list.length)];
          if (settings.isSequential) seqIndex.current += 1;
        }
      }
      if (!msg) {
        setErrorMessage('Please enter messages!');
        setIsRunning(false);
        return;
      }
      const log = msg.startsWith('emoji:') && settings.activeTab === 'emoji'
        ? msg
        : `[${new Date().toLocaleTimeString()}] ${msg}`;
      setLogs(prev => [log, ...prev].slice(0, 3));
      const delay = (settings.minTime + Math.floor(Math.random() * (settings.maxTime - settings.minTime + 1))) * 1000;
      timeout = setTimeout(loop, delay);
    };
    if (isRunning) timeout = setTimeout(loop, 500);
    return () => {
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [isRunning]);

  const handleStartSelect = useCallback(() => {
    setIsSelecting(true);
  }, []);

  const handleSelectDummy = useCallback(() => {
    if (isSelecting) {
      setIsSelecting(false);
      setTargetSet(true);
      setHoveringDummy(false); 
      setIsRunning(false);
    }
  }, [isSelecting]);

  const handleReset = useCallback(() => {
    setTargetSet(false);
    setIsRunning(false);
    setIsSelecting(false);
    setErrorMessage(null);
    seqIndex.current = 0;
  }, []);

  const handleStartEngine = useCallback(() => {
    if (!targetSet || !validIntervals(minTime, maxTime)) return;
    if ((activeTab === 'single' && !singleMessage.trim()) || (activeTab === 'list' && !listMessages.trim())) {
      setErrorMessage('Please enter messages!');
      return;
    }
    seqIndex.current = 0;
    setErrorMessage(null);
    setIsRunning(true);
  }, [targetSet, minTime, maxTime, activeTab, singleMessage, listMessages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const previous = fileReader.current;
    fileReader.current = null;
    previous?.abort();
    if (!/\.txt$/i.test(file.name) || file.size > 1024 * 1024) {
      setErrorMessage('Import a .txt file no larger than 1 MiB.');
      return;
    }
    setErrorMessage(null);
    const reader = new FileReader();
    fileReader.current = reader;
    reader.onerror = () => {
      if (fileReader.current !== reader) return;
      fileReader.current = null;
      setErrorMessage('Unable to read imported file.');
    };
    reader.onload = () => {
      if (fileReader.current !== reader) return;
      fileReader.current = null;
      if (typeof reader.result === 'string') {
        setListMessages(reader.result);
        setErrorMessage(null);
      }
    };
    reader.readAsText(file);
  };

  const isInvalidTime = !validIntervals(minTime, maxTime);

  return (
    <div className="flex flex-col h-full bg-[#0b0e11] relative overflow-hidden font-sans">
      
      {/* Top Section: Popup Simulator */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 overflow-y-auto">
        <div className="mb-4 text-center">
            <h2 className="text-lg font-bold text-white mb-0.5">Extension Preview</h2>
            {isSelecting ? (
                <div className="animate-bounce">
                    <p className="text-[#53fc18] font-mono text-xs bg-[#53fc18]/10 px-3 py-1 rounded border border-[#53fc18]/30 inline-block">
                        👇 CLICK THE CHAT BAR BELOW 👇
                    </p>
                </div>
            ) : (
                <p className="text-gray-500 text-xs">Simulation only — no messages are sent to Kick.com</p>
            )}
        </div>

        {/* Extension Frame */}
        <div className="relative w-[310px] bg-[#0b0e11] border border-[#27272a] shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col z-20 transition-all duration-300 rounded-lg">
            <div className="p-4 box-border text-white font-sans">
                
                {/* Header */}
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-[#53fc18] text-black font-black text-xs flex items-center justify-center rounded-[3px]">K</div>
                      <h1 className="text-sm font-bold m-0 tracking-tight">Kick Auto Chat</h1>
                    </div>
                    <div className="bg-[#53fc18]/15 text-[#53fc18] border border-[#53fc18]/30 text-[10px] px-1.5 py-0.5 rounded font-bold">1.0.0</div>
                </div>

                {/* Target Section */}
                <div className="text-[10px] font-bold text-[#71717a] mb-1.5 tracking-[0.5px]">TARGET ELEMENT</div>
                
                {!targetSet ? (
                    <div id="selection-group">
                        <button 
                            type="button"
                            onClick={handleStartSelect}
                            disabled={isSelecting}
                            className={`w-full bg-transparent border border-dashed border-[#53fc18] text-[#53fc18] p-2 rounded-md cursor-pointer font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-2
                            ${isSelecting ? 'bg-[#53fc18]/15 opacity-90' : 'hover:bg-[#53fc18]/10'}`}
                        >
                            <Crosshair size={13} className={isSelecting ? "animate-spin text-[#53fc18]" : ""} />
                            {isSelecting ? 'Waiting for Click...' : 'Select Chat Input'}
                        </button>
                        <div className="text-[10px] text-[#71717a] text-center mt-1">Click button, then click chat box on Kick.com</div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between bg-[#53fc18]/10 border border-[#53fc18] px-3 py-2 rounded-md">
                        <div className="flex items-center gap-2 text-xs text-[#53fc18] font-mono">
                            <CheckCircle size={13} />
                            <span>Kick Chat Input</span>
                        </div>
                        <button
                            type="button"
                            onClick={handleReset}
                            aria-label="Reset selected chat target"
                            className="bg-transparent border-none text-gray-400 hover:text-white cursor-pointer p-0 transition"
                        >
                            <X size={13} />
                        </button>
                    </div>
                )}

                {/* Divider */}
                <div className="h-px bg-[#27272a] my-3"></div>

                {/* Tabs */}
                <div className="flex bg-[#18181b] p-[2px] rounded-md mb-2 border border-[#27272a]">
                    {(['list', 'single', 'emoji'] as const).map((tab) => (
                      <button 
                          key={tab}
                          type="button"
                          onClick={() => { setActiveTab(tab); setErrorMessage(null); }}
                          className={`flex-1 border-none p-1.5 text-[11px] capitalize cursor-pointer transition-all ${activeTab === tab ? 'bg-[#27272a] text-white rounded font-semibold' : 'bg-transparent text-[#71717a]'}`}
                      >
                          {tab}
                      </button>
                    ))}
                </div>

                {/* Area Header */}
                {activeTab === 'list' && (
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="preview-list" className="text-[11px] text-[#a1a1aa] font-medium m-0">Messages</label>
                        <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-none border-none text-[#53fc18] text-[10px] cursor-pointer p-0 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#53fc18] flex items-center gap-1"
                        >
                            <Upload size={10} /> Import .txt
                        </button>
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="sr-only"
                          accept=".txt"
                          aria-label="Import message list from a text file"
                          onChange={handleFileUpload}
                        />
                    </div>
                )}

                {activeTab === 'single' && (
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="preview-single" className="text-[11px] text-[#a1a1aa] font-medium m-0">Single Message</label>
                    </div>
                )}

                {/* Textarea for List Mode */}
                {activeTab === 'list' && (
                     <textarea 
                        className="w-full bg-[#18181b] border border-[#27272a] text-white p-2 rounded-md box-border focus:border-[#53fc18] outline-none resize-none text-xs font-mono"
                        rows={4}
                        id="preview-list"
                         placeholder="W Streamer (One per line)"
                        value={listMessages}
                        onChange={(e) => { setListMessages(e.target.value); setErrorMessage(null); }}
                    />
                )}

                {/* Textarea for Single Mode */}
                {activeTab === 'single' && (
                     <textarea 
                        className="w-full bg-[#18181b] border border-[#27272a] text-white p-2 rounded-md box-border focus:border-[#53fc18] outline-none resize-none text-xs font-mono"
                        rows={4}
                        id="preview-single"
                         placeholder="Type a single message to repeat..."
                        value={singleMessage}
                        onChange={(e) => { setSingleMessage(e.target.value); setErrorMessage(null); }}
                    />
                )}

                {/* Emoji Grid */}
                {activeTab === 'emoji' && (
                    <div className="grid grid-cols-6 gap-1 max-h-[96px] overflow-y-auto bg-[#18181b] p-1.5 rounded-md border border-[#27272a]">
                        {KICK_EMOJIS.map((emoji) => (
                            <button
                                key={emoji.name}
                                type="button"
                                onClick={() => setSelectedEmoji(emoji.name)}
                                aria-label={`Select ${emoji.name}`}
                                aria-pressed={selectedEmoji === emoji.name}
                                className={`
                                    cursor-pointer rounded p-1 flex items-center justify-center border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#53fc18]
                                    ${selectedEmoji === emoji.name
                                        ? 'bg-[#53fc18]/15 border-[#53fc18]' 
                                        : 'border-transparent hover:bg-[#27272a]'}
                                `}
                            >
                                <img src={emoji.url} alt="" className="w-5 h-5 object-contain" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Sequential Checkbox */}
                {activeTab === 'list' && (
                    <div className="flex items-center gap-2 mt-1.5">
                        <input 
                            type="checkbox" 
                            id="seq-check"
                            checked={isSequential}
                            onChange={(e) => setIsSequential(e.target.checked)}
                            className="accent-[#53fc18] w-3.5 h-3.5 cursor-pointer"
                        />
                        <label htmlFor="seq-check" className="text-[11px] text-[#a1a1aa] cursor-pointer select-none">Send in Order (Sequential)</label>
                    </div>
                )}

                 <SimulationIntervals minTime={minTime} maxTime={maxTime} onMinChange={setMinTime} onMaxChange={setMaxTime} />

                 {/* Status Bar */}
                 <div className="text-center text-[11px] text-[#71717a] mt-2">
                     Status: <span style={{ color: isInvalidTime || errorMessage ? '#ef4444' : (isRunning || targetSet ? '#53fc18' : 'inherit') }}>
                         {isInvalidTime ? 'Simulation only: Use whole seconds 1–86400, Min ≤ Max.' : errorMessage ? `Simulation only: ${errorMessage}` : isRunning ? 'Simulation only: Running...' : targetSet ? 'Simulation only: Ready to start' : 'Simulation only: Waiting for target...'}
                     </span>
                 </div>

                 {/* Actions */}
                 <div className="mt-2">
                     {!isRunning ? (
                          <button
                             type="button"
                             disabled={!targetSet || isInvalidTime}
                             onClick={handleStartEngine}
                             className={`w-full bg-[#53fc18] text-black font-extrabold p-2.5 border-none rounded-md cursor-pointer flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all
                             ${(!targetSet || isInvalidTime) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#42ca14] hover:shadow-[0_0_15px_rgba(83,252,24,0.4)]'}`}
                         >
                             <Play size={13} className="fill-black" />
                             START ENGINE
                         </button>
                     ) : (
                         <button
                              type="button"
                              onClick={() => setIsRunning(false)}
                              className="w-full bg-[#ef4444] text-white font-extrabold p-2.5 border-none rounded-md cursor-pointer flex items-center justify-center gap-2 text-xs uppercase tracking-wider hover:bg-[#dc2626] transition-all"
                         >
                              <Square size={13} className="fill-white" />
                              STOP
                         </button>
                     )}
                 </div>

             </div>
         </div>
       </div>

      <SimulatedChat
        logs={logs}
        isSelecting={isSelecting}
        targetSet={targetSet}
        hoveringDummy={hoveringDummy}
        onSelect={handleSelectDummy}
        onHoverChange={setHoveringDummy}
      />

    </div>
  );
};

type SimulationIntervalsProps = {
  minTime: number;
  maxTime: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
};

function SimulationIntervals({ minTime, maxTime, onMinChange, onMaxChange }: SimulationIntervalsProps) {
  return (
                 <div className="flex gap-2 mt-2">
                    <div className="flex-1">
                        <label htmlFor="preview-min" className="text-[10px] text-[#a1a1aa] font-medium mb-1 block">Min (s)</label>
                        <input 
                            type="number" 
                            min="1"
                            id="preview-min"
                             value={Number.isNaN(minTime) ? '' : minTime}
                            max="86400"
                             step="1"
                              onChange={(e) => onMinChange(e.target.valueAsNumber)}
                            className="w-full bg-[#18181b] border border-[#27272a] text-white p-1.5 rounded-md box-border focus:border-[#53fc18] outline-none text-xs" 
                        />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="preview-max" className="text-[10px] text-[#a1a1aa] font-medium mb-1 block">Max (s)</label>
                        <input 
                            type="number" 
                            min="1"
                            id="preview-max"
                             value={Number.isNaN(maxTime) ? '' : maxTime}
                            max="86400"
                             step="1"
                              onChange={(e) => onMaxChange(e.target.valueAsNumber)}
                            className="w-full bg-[#18181b] border border-[#27272a] text-white p-1.5 rounded-md box-border focus:border-[#53fc18] outline-none text-xs" 
                        />
                    </div>
                </div>

  );
}

type SimulatedChatProps = {
  logs: string[];
  isSelecting: boolean;
  targetSet: boolean;
  hoveringDummy: boolean;
  onSelect: () => void;
  onHoverChange: (hovering: boolean) => void;
};

function SimulatedChat({ logs, isSelecting, targetSet, hoveringDummy, onSelect, onHoverChange }: SimulatedChatProps) {
  return (
      <div className="h-36 bg-[#080a0c] border-t border-gray-800/80 flex flex-col justify-between shrink-0">
        {/* Dedicated Simulation Header Bar */}
        <div className="h-6 bg-[#0f1217] border-b border-gray-800/60 px-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#53fc18] animate-pulse"></span>
            <span className="text-[10px] font-mono text-gray-300 font-bold uppercase tracking-wider">
              Kick.com Chat Simulation
            </span>
          </div>
          <span className="text-[9px] font-mono text-gray-500">Simulation only</span>
        </div>

        {/* Chat Messages Area */}
        <div className="flex-1 flex flex-col justify-end gap-1 px-3 py-1 overflow-hidden">
          {logs.map((log, i) => (
            <div key={`log-${i}`} className="flex items-center gap-2 text-xs">
              <span className="font-bold text-[#53fc18] shrink-0">You:</span>
              {log.startsWith('emoji:') ? (
                <img src={log.split('emoji:')[1]} className="w-4 h-4 object-contain" alt="emoji" />
              ) : (
                <span className="text-white break-words truncate">{log}</span>
              )}
            </div>
          ))}
        </div>

        {/* Dummy Input Element */}
        <div className="px-3 pb-2">
          <div 
            className={`
              relative h-9 bg-[#121418] rounded-md border flex items-center px-3 transition-all group z-10
              ${isSelecting 
                ? 'border-[#53fc18] shadow-[0_0_20px_rgba(83,252,24,0.35)] animate-pulse' 
                : targetSet ? 'border-[#53fc18]/40' : 'border-gray-800'}
              ${hoveringDummy && isSelecting ? 'bg-[#53fc18]/10' : ''}
            `}
          >
            {isSelecting && (
              <button
                type="button"
                onClick={onSelect}
                onMouseEnter={() => onHoverChange(true)}
                onMouseLeave={() => onHoverChange(false)}
                className="absolute inset-[-6px] z-50 cursor-crosshair flex items-center justify-center rounded-lg bg-[#53fc18]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#53fc18]"
              >
                <span className="bg-[#53fc18] text-black text-[10px] font-extrabold px-3 py-1 rounded shadow-lg animate-bounce border border-black uppercase tracking-wider">
                  Click Chat to Select Target
                </span>
              </button>
            )}
            
            <div className="text-gray-500 text-xs font-medium">Send a message...</div>
            <div className="ml-auto bg-[#53fc18] px-2 py-0.5 rounded text-[10px] font-extrabold text-black opacity-90">Chat</div>
          </div>
        </div>
      </div>
  );
}

export default PreviewPanel;
