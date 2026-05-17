import { NextRequest } from 'next/server';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { getTokenSummary } from '@/server/tokens';
import { CHARACTER_PROJECT_CREATION_TOKENS, MINIMUM_PROJECT_TOKENS, TOKEN_COSTS } from '@/shared/constants/token-costs';
import { verifyMobileAccessToken } from '@/server/mobile-auth';

export const GET = withApiError(async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length).trim()
    : '';

  if (!token) {
    return unauthorized('Missing access token.');
  }

  const claims = await verifyMobileAccessToken(token);
  if (!claims?.sub) {
    return unauthorized('Invalid or expired access token.');
  }

  const summary = await getTokenSummary(claims.sub);
  return ok({
    balance: summary.balance,
    perSecondProject: TOKEN_COSTS.perSecondProject,
    minimumProjectTokens: MINIMUM_PROJECT_TOKENS,
    minimumProjectSeconds: TOKEN_COSTS.minimumProjectSeconds,
    characterProjectTokens: CHARACTER_PROJECT_CREATION_TOKENS,
    characterProjectTokenCosts: TOKEN_COSTS.characterProjects,
    actionCosts: TOKEN_COSTS.actions,
    signUpBonus: TOKEN_COSTS.signUpBonus,
  });
}, 'Failed to load mobile token summary');
