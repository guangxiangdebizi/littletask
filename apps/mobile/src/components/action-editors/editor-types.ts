import type { ActionCard, ActionPatchRequest, ActionType } from '@littletask/contracts';

export interface ActionEditorProps {
  action: ActionCard;
  editable: boolean;
  saving: boolean;
  onSave: (payload: ActionPatchRequest['payload']) => void;
}

export type TypedEditorProps<T extends ActionType> = Omit<ActionEditorProps, 'action'> & {
  action: Extract<ActionCard, { type: T }>;
};
