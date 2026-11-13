export interface ButtonStyle {
  visible?: boolean;
  label?: string;
  bg?: string;
  fg?: string;
  border?: string;
  hoverBg?: string;
  focusRing?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number | string;
  letterSpacing?: string;
  radius?: string;
  padding?: string;
  textTransform?: string;
  scale?: number;
}

export interface AuxiliaryElement {
  id: string;
  action: 'ADD' | 'REMOVE';
  kind?: 'text' | 'panel';
  placement?: 'ABOVE' | 'BELOW';
  text?: string;
  bg?: string;
  fg?: string;
  border?: string;
  fontSize?: string;
  fontWeight?: number | string;
  letterSpacing?: string;
  align?: string;
  padding?: string;
}

export interface PageState {
  cart: ButtonStyle;
  cancel: ButtonStyle;
  elements: AuxiliaryElement[];
}

export interface Mutation {
  id: string;
  describes: string;
  reset?: boolean;
  cart?: Partial<ButtonStyle>;
  cancel?: Partial<ButtonStyle>;
  elements?: AuxiliaryElement[];
}

export interface Choice {
  id: string;
  scene: string;
  text: string;
  type: string;
  effects?: {
    rejectTopic?: string;
    rejectLiveTopic?: boolean;
    requireConsentAudit?: boolean;
  };
  resolutions?: string[];
}

export interface PhraseVariant {
  id: string;
  reel: string;
  lead: string;
  inline: string;
  needsPushback?: boolean;
}

export interface PhraseFamily {
  id: string;
  variants: PhraseVariant[];
}

export interface PresentationStep {
  kind: 'tool' | 'thinking';
  text: string;
}

export interface ResponseTemplate {
  id: string;
  text: string;
  phraseSlots?: {
    family: string;
    placement: string;
  }[];
  rationale?: string;
}

export interface Resolution {
  id: string;
  scene: string;
  semanticIntent: string;
  responseTemplates: ResponseTemplate[];
  mutation?: string;
  effects?: Record<string, any>;
  conditions?: Record<string, any>;
  presentation?: PresentationStep[];
  nextScene: string;
  ending?: {
    id: string;
    title: string;
    spinAgain?: boolean;
  };
}

export interface Scene {
  id: string;
  situation: string;
}
