export interface FlowChoice {
  id: string;
  text: string;
  nextNodeId?: string;
  action?: 'auth_google' | 'auth_apple' | 'auth_general' | 'link';
  href?: string;
}

export interface FlowNode {
  id: string;
  aiMessage: string;
  metaNote?: string;
  referralLink?: {
    label: string;
    url: string;
  };
  choices: FlowChoice[];
}
