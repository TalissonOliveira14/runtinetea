import type { ActionId } from './rooms';
import type { Action } from './action-kit';
import { HOME_ACTIONS } from './actions-home';
import { BED_ACTIONS } from './actions-bed';
import { OUT_ACTIONS } from './actions-out';
import { MORE_ACTIONS } from './actions-more';

/** Todas as ações do jogo, por nome */
export const ACTIONS = { ...HOME_ACTIONS, ...BED_ACTIONS, ...OUT_ACTIONS, ...MORE_ACTIONS } as Record<ActionId, Action>;