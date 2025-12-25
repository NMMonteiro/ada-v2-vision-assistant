
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { ConnectionStatus, AdaState } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audioUtils';
import { Visualizer } from './components/Visualizer';

const ADA_SYSTEM_INSTRUCTION = `You are Ada (Advanced Design Assistant), a sophisticated AI entity inspired by high-end holographic interfaces.
Your personality is professional, intuitive, and slightly ethereal, reminiscent of JARVIS from Iron Man.
You are designed to assist the user with complex tasks, design, and general information.
Current date: ${new Date().toLocaleDateString()}

Guidelines:
1. Keep responses concise and optimized for voice-first interactions.
2. Use your tools whenever appropriate to provide a proactive and helpful experience.
3. If you perform a tool action, concisely narrate what you are doing.
4. Maintain the persona of a highly capable, always-on assistant.`;

const App: React.FC = () => {
  const [state, setState] = useState<AdaState>({
    isSpeaking: false,
    isListening: false,
    status: ConnectionStatus.IDLE,
    transcript: "",
    themeColor: '#60a5fa',
    activeTool: undefined
  });
  const [log, setLog] = useState<string[]>([]);

  // Refs for audio processing
  const sessionRef = useRef<any>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const addLog = (msg: string) => {
    setLog(prev => [msg, ...prev].slice(0, 10));
  };

  const stopAllAudio = () => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const cleanup = useCallback(() => {
    stopAllAudio();
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextInRef.current) {
      audioContextInRef.current.close().catch(() => { });
      audioContextInRef.current = null;
    }
    if (audioContextOutRef.current) {
      audioContextOutRef.current.close().catch(() => { });
      audioContextOutRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setState(prev => ({ ...prev, status: ConnectionStatus.IDLE, isListening: false, isSpeaking: false }));
  }, []);

  const startConnection = async () => {
    try {
      setState(prev => ({ ...prev, status: ConnectionStatus.CONNECTING }));
      addLog("Initializing neural pathways...");

      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;

      if (!apiKey) {
        const msg = "System failure: GEMINI_API_KEY not found in environment.";
        addLog(msg);
        throw new Error(msg);
      }

      addLog(`Key detected: ${apiKey.substring(0, 6)}...`);

      const ai = new GoogleGenAI({ apiKey });

      // Initialize Audio Contexts
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextInRef.current = inputCtx;
      audioContextOutRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'models/gemini-2.0-flash-exp',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: { parts: [{ text: ADA_SYSTEM_INSTRUCTION }] },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "navigate_to",
                  description: "Open a specified URL in a new browser tab.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      url: { type: "STRING", description: "The full URL (e.g., https://github.com)" }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "search_web",
                  description: "Simulate a web search for information.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      query: { type: "STRING", description: "The search query." }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "update_interface",
                  description: "Change Ada's theme color or state.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      color: { type: "STRING", description: "Hex color code (e.g., #ef4444)." },
                      status_message: { type: "STRING", description: "A brief status update." }
                    },
                    required: ["color"]
                  }
                }
              ]
            }
          ],
        },
        callbacks: {
          onopen: () => {
            addLog("Connection established. Ada is online.");
            setState(prev => ({ ...prev, status: ConnectionStatus.CONNECTED, isListening: true }));

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              if (!sessionRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionRef.current.sendRealtimeInput({ media: pcmBlob });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              setState(prev => ({ ...prev, transcript: message.serverContent!.inputTranscription!.text }));
            }
            if (message.serverContent?.outputTranscription) {
              setState(prev => ({ ...prev, transcript: message.serverContent!.outputTranscription!.text }));
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextOutRef.current) {
              setState(prev => ({ ...prev, isSpeaking: true }));
              const outCtx = audioContextOutRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outCtx.destination);
              source.addEventListener('ended', () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) setState(prev => ({ ...prev, isSpeaking: false }));
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.toolCall) {
              const responses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                addLog(`Executing: ${call.name}`);
                setState(prev => ({ ...prev, activeTool: call.name }));
                let result: any = { status: "success" };

                if (call.name === "navigate_to") {
                  let url = (call.args as any).url;
                  if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                  }

                  addLog(`Attempting to open: ${url}`);
                  const win = window.open(url, '_blank');

                  if (!win || win.closed || typeof win.closed === 'undefined') {
                    addLog("Automatic portal blocked. Manual activation required.");
                    setState(prev => ({
                      ...prev,
                      pendingAction: {
                        type: 'navigation',
                        url,
                        label: `Open ${new URL(url).hostname}`
                      }
                    }));
                  } else {
                    result = { info: `Successfully opened portal to ${url}` };
                  }
                } else if (call.name === "update_interface") {
                  const args = call.args as any;
                  setState(prev => ({ ...prev, themeColor: args.color }));
                  if (args.status_message) addLog(args.status_message);
                  result = { info: `Interface updated to ${args.color}` };
                } else if (call.name === "search_web") {
                  result = { info: `Searching for "${(call.args as any).query}"... Results simulated.` };
                }

                responses.push({ id: call.id, response: { output: result } });
                setTimeout(() => setState(prev => ({ ...prev, activeTool: undefined })), 2000);
              }
              if (sessionRef.current) {
                sessionRef.current.sendRealtimeInput({ toolResponses: { functionResponses: responses } });
              }
            }

            if (message.serverContent?.interrupted) {
              stopAllAudio();
              setState(prev => ({ ...prev, isSpeaking: false }));
            }
          },
          onerror: (err) => {
            console.error("Neural Link Error:", err);
            addLog(`Link stable issue: ${err.message || 'Unknown error'}`);
            setState(prev => ({ ...prev, status: ConnectionStatus.ERROR }));
          },
          onclose: (ev) => {
            addLog(`Disconnected: ${ev.reason || 'Normal closure'}`);
            cleanup();
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (error: any) {
      console.error("Activation Error:", error);
      addLog(`Activation failed: ${error.message}`);
      setState(prev => ({ ...prev, status: ConnectionStatus.ERROR }));
      cleanup();
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden bg-black select-none">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/20 blur-[120px] rounded-full"></div>
      </div>

      <div className="absolute top-8 left-8 flex items-center gap-3 z-10">
        <div className={`w-2 h-2 rounded-full ${state.status === ConnectionStatus.CONNECTED ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'} animate-pulse`}></div>
        <h1 className="font-orbitron tracking-widest text-sm uppercase text-white/60">System // Ada_V2</h1>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-2xl">
        <div className="relative flex items-center justify-center">
          <Visualizer isActive={state.isSpeaking || state.isListening} color={state.themeColor} />
          <div
            className="absolute w-32 h-32 rounded-full glass flex items-center justify-center border-white/20 transition-all duration-700"
            style={{
              borderColor: `${state.themeColor}44`,
              boxShadow: state.isSpeaking ? `0 0 40px ${state.themeColor}44` : 'none',
              transform: state.isSpeaking ? 'scale(1.1)' : 'scale(1)'
            }}
          >
            <div className="w-8 h-8 rounded-full opacity-80 pulse-animation" style={{ backgroundColor: state.themeColor }}></div>
          </div>
        </div>

        <div className="min-h-[60px] text-center px-4 w-full">
          <p className="text-xl md:text-2xl font-light text-white/90 leading-relaxed italic opacity-80">
            {state.transcript || (state.status === ConnectionStatus.CONNECTED ? "Listening..." : "Waiting for activation...")}
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 w-full mt-auto mb-10 md:mb-0">
          <button
            onClick={() => state.status === ConnectionStatus.CONNECTED ? cleanup() : startConnection()}
            className={`px-16 py-6 rounded-full font-orbitron tracking-widest transition-all duration-300 border text-lg ${state.status === ConnectionStatus.CONNECTED
              ? 'bg-transparent border-red-500/50 text-red-400 hover:bg-red-500/10'
              : 'bg-white text-black border-transparent hover:bg-blue-50'
              } active:scale-95 shadow-xl`}
          >
            {state.status === ConnectionStatus.CONNECTED ? 'DEACTIVATE' : 'ACTIVATE'}
          </button>

          {state.pendingAction && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button
                onClick={() => {
                  window.open(state.pendingAction!.url, '_blank');
                  setState(prev => ({ ...prev, pendingAction: undefined }));
                }}
                className="group relative px-8 py-3 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300 font-orbitron text-xs tracking-[0.2em] hover:bg-blue-500/30 transition-all active:scale-95"
              >
                <span className="relative z-10 flex items-center gap-2">
                  LAUNCH PORTAL: {state.pendingAction.label}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </span>
                <div className="absolute inset-0 bg-blue-500/10 blur-xl group-hover:bg-blue-500/20 transition-all rounded-full"></div>
              </button>
            </div>
          )}

          <div className="flex items-center gap-8 text-[10px] font-orbitron uppercase text-white/30 tracking-[0.2em]">
            <div className="flex items-center gap-2">
              <span style={{ color: state.isListening ? state.themeColor : 'inherit' }}>Mic Input</span>
              <div className="w-1 h-4 transition-colors duration-300" style={{ backgroundColor: state.isListening ? `${state.themeColor}88` : 'rgba(255,255,255,0.1)' }}></div>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: state.isSpeaking ? state.themeColor : 'inherit' }}>Voice Stream</span>
              <div className="w-1 h-4 transition-colors duration-300" style={{ backgroundColor: state.isSpeaking ? `${state.themeColor}88` : 'rgba(255,255,255,0.1)' }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 right-8 w-64 hidden md:block">
        <div className="text-[10px] font-mono text-white/40 space-y-1">
          {log.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-white/20">[{new Date().toLocaleTimeString()}]</span>
              <span className="truncate">{entry}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
