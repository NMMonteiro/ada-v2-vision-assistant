
export enum ConnectionStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface Message {
  role: 'user' | 'ada';
  text: string;
}

export interface AdaState {
  isSpeaking: boolean;
  isListening: boolean;
  status: ConnectionStatus;
  transcript: string;
  themeColor: string;
  activeTool?: string;
  pendingAction?: {
    type: 'navigation';
    url: string;
    label: string;
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}
