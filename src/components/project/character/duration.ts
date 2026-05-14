import { CHARACTER_PROJECT_TARGET_DURATION_SECONDS } from '@/shared/constants/character-project';

export function resolveCharacterExpectedDurationSeconds(useExactTextAsScript: boolean): number | null {
  return useExactTextAsScript ? null : CHARACTER_PROJECT_TARGET_DURATION_SECONDS;
}
