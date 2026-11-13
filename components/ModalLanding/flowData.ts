import type { FlowNode } from './flowTypes';
import { listenerFlowNodes } from './flowListenerNodes';
import { promoterFlowNodes } from './flowPromoterNodes';

export type { FlowChoice, FlowNode } from './flowTypes';

export const initialNodeId = 'root';

export const flowNodes: Record<string, FlowNode> = {
  ...listenerFlowNodes,
  ...promoterFlowNodes,
};

// Aliases for backwards compatibility with any persisted user sessions in local app storage
flowNodes['path_listener_chosen'] = flowNodes['listener_l1'];
flowNodes['path_promoter_chosen'] = flowNodes['promoter_p1'];
