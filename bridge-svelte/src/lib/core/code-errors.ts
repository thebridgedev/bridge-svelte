/**
 * What a code screen says when a typed code is refused: a wrong code with its tries left, an expired one (send a new
 * one), a new code asked for too soon, a wrong recovery code; anything else as every screen says it.
 */
import { codeRefusal, isBridgeError } from '@nebulr-group/bridge-auth-core';
import { errorMessage, type BridgeTranslator } from './i18n.js';

export function codeErrorMessage(error: unknown, t: BridgeTranslator): string {
	const refused = codeRefusal(error);
	if (refused?.reason === 'wrong') return refused.triesLeft === 1 ? t('code.wrongOne') : refused.triesLeft === null ? t('code.wrongAny') : t('code.wrong', { count: refused.triesLeft });
	if (refused?.reason === 'expired') return t('code.expired');
	if (refused?.reason === 'too-soon') return t('code.tooSoon', { seconds: refused.retryAfterSeconds ?? 60 });
	if (isBridgeError(error) && error.code === 'wrong_recovery_code') return t('secondStep.wrongRecovery');
	if (isBridgeError(error) && error.code === 'second_step_unavailable') return t('secondStep.unavailable');
	return errorMessage(error, t, 'error.generic');
}

/** Whether the code is spent: the screen offers only "Send a new code" then. */
export function codeSpent(error: unknown): boolean {
	return codeRefusal(error)?.reason === 'expired';
}
