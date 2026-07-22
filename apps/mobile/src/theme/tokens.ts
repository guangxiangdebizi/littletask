import type { ActionType } from '@littletask/contracts';

export const colors = {
  canvas: '#F2F6F3',
  surface: '#FFFFFF',
  surfaceMuted: '#EAF0EC',
  ink: '#15221B',
  muted: '#5D6B63',
  faint: '#7D8982',
  line: '#D7DFDA',
  lineStrong: '#B8C5BD',
  pine: '#176348',
  pinePressed: '#104934',
  pineSoft: '#DCEDE5',
  amber: '#986016',
  amberSoft: '#FFF1D2',
  blue: '#315F87',
  blueSoft: '#E2ECF4',
  coral: '#A84F3E',
  coralSoft: '#F8E4DF',
  transparent: 'transparent',
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  pill: 999,
} as const;

export const actionVisuals: Record<
  ActionType,
  { label: string; accent: string; soft: string; icon: 'calendar' | 'user-plus' | 'edit-3' }
> = {
  create_event: {
    label: '创建会议',
    accent: colors.blue,
    soft: colors.blueSoft,
    icon: 'calendar',
  },
  create_contact: {
    label: '创建联系人',
    accent: colors.pine,
    soft: colors.pineSoft,
    icon: 'user-plus',
  },
  update_contact: {
    label: '更新联系人',
    accent: colors.amber,
    soft: colors.amberSoft,
    icon: 'edit-3',
  },
};
