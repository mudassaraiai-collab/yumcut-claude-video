import { describe, expect, it } from 'vitest';
import { ProjectStatus } from '@/shared/constants/status';
import {
  formatCharacterProjectDuration,
  getCharacterProjectCopy,
  getCharacterProjectStatusDescription,
  getCharacterProjectStatusLabel,
  getCharacterProjectToneMeta,
  getCharacterProjectVoiceTraitLabel,
} from '@/components/project/character/i18n';
import { resolveCharacterExpectedDurationSeconds } from '@/components/project/character/duration';

describe('character project i18n', () => {
  it('returns localized status labels and descriptions for ru', () => {
    expect(getCharacterProjectStatusLabel(ProjectStatus.ProcessAudio, 'ru')).toBe('Генерация озвучки');
    expect(getCharacterProjectStatusDescription(ProjectStatus.Done, 'ru')).toBe('Финальное видео готово к просмотру и скачиванию.');
  });

  it('returns localized status labels and descriptions for en', () => {
    expect(getCharacterProjectStatusLabel(ProjectStatus.ProcessAudio, 'en')).toBe('Generating audio');
    expect(getCharacterProjectStatusDescription(ProjectStatus.Done, 'en')).toBe('Final video is ready for preview and download.');
  });

  it('formats durations with language-specific short suffix', () => {
    expect(formatCharacterProjectDuration(45, 'en')).toBe('45s');
    expect(formatCharacterProjectDuration(45, 'ru')).toBe('45с');
    expect(formatCharacterProjectDuration(65, 'ru')).toBe('1:05');
  });

  it('uses 20s expected duration for idea mode and em dash for exact script mode', () => {
    expect(formatCharacterProjectDuration(resolveCharacterExpectedDurationSeconds(false), 'en')).toBe('20s');
    expect(formatCharacterProjectDuration(resolveCharacterExpectedDurationSeconds(true), 'en')).toBe('—');
  });

  it('returns localized tone metadata and core copy labels', () => {
    expect(getCharacterProjectToneMeta('playful', 'ru')).toEqual({ label: 'Игривый', emoji: '😄' });
    const ru = getCharacterProjectCopy('ru');
    expect(ru.projectPreview).toBe('Предпросмотр проекта');
    expect(ru.tokensUnit).toBe('токенов');
  });

  it('localizes voice traits for ru tooltip', () => {
    expect(getCharacterProjectVoiceTraitLabel('male', 'ru')).toBe('Мужской');
    expect(getCharacterProjectVoiceTraitLabel('slow', 'ru')).toBe('Медленный');
    expect(getCharacterProjectVoiceTraitLabel('male', 'en')).toBe('Male');
    expect(getCharacterProjectVoiceTraitLabel('slow', 'en')).toBe('Slow');
  });
});
