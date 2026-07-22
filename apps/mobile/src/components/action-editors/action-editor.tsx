import { ContactEditor } from './contact-editor';
import type { ActionEditorProps } from './editor-types';
import { MeetingEditor } from './meeting-editor';
import { UpdateContactEditor } from './update-contact-editor';

export function ActionEditor(props: ActionEditorProps) {
  switch (props.action.type) {
    case 'create_event':
      return <MeetingEditor {...props} action={props.action} />;
    case 'create_contact':
      return <ContactEditor {...props} action={props.action} />;
    case 'update_contact':
      return <UpdateContactEditor {...props} action={props.action} />;
  }
}
