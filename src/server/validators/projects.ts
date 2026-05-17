import { z } from 'zod';
import { LIMITS } from '@/server/limits';
import { LANGUAGE_CODES, LANGUAGE_ENUM } from '@/shared/constants/languages';
import { PROJECT_EXPERIENCES } from '@/shared/constants/project-experience';
import { CONTENT_TONES } from '@/shared/constants/content-tone';
import { CHARACTER_PROJECT_TARGET_DURATION_SECONDS } from '@/shared/constants/character-project';
import {
  CHARACTER_VIDEO_GENERATION_MODES,
  CHARACTER_VIDEO_QUALITIES,
  CHARACTER_VIDEO_QUALITY_TO_GENERATION_MODE,
  normalizeCharacterVideoGenerationMode,
} from '@/shared/constants/character-video-quality';
const scriptTextSchema = z
  .string()
  .trim()
  .min(LIMITS.approvedScriptMin, { message: `Approved script must be at least ${LIMITS.approvedScriptMin} characters` })
  .max(LIMITS.rawScriptMax, { message: `Script must be at most ${LIMITS.rawScriptMax} characters` });

const staticCharacterSelectionSchema = z.object({
  characterId: z.string().uuid().optional(),
  userCharacterId: z.string().uuid().optional(),
  variationId: z.string().uuid().optional(),
}).partial().strict();

export const characterSelectionSchema = z.union([
  staticCharacterSelectionSchema,
  z.object({
    source: z.literal('dynamic'),
  }),
]);

const languageVoiceIdSchema = z.string().min(1).max(128);
const videoGenerationSchema = z.object({
  mode: z.enum(CHARACTER_VIDEO_GENERATION_MODES),
  lipsyncPrompt: z.string().trim().min(1).max(LIMITS.promptMax).optional(),
}).strict();

const languageVoiceRecordSchema = z.record(z.string(), languageVoiceIdSchema).superRefine((val, ctx) => {
  if (!val || typeof val !== 'object') return;
  for (const key of Object.keys(val)) {
    if (!LANGUAGE_CODES.includes(key as typeof LANGUAGE_CODES[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported language code "${key}"`,
        path: ['languageVoices', key],
      });
    }
  }
});

export const createProjectSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, { message: 'Prompt cannot be empty' })
    .max(LIMITS.promptMax, { message: `Prompt must be at most ${LIMITS.promptMax} characters` })
    .optional(),
  rawScript: z
    .string()
    .trim()
    .min(1, { message: 'Script cannot be empty' })
    .max(LIMITS.rawScriptMax, { message: `Script must be at most ${LIMITS.rawScriptMax} characters` })
    .optional(),
  // Allow custom seconds in [1, 1800]; experience-specific minimum is validated in superRefine.
  durationSeconds: z.number().int().min(1, { message: 'Minimum duration is 1 second' }).max(1800, { message: 'Maximum duration is 30 minutes' }).optional(),
  characterSelection: characterSelectionSchema.optional(),
  characterSlug: z
    .string()
    .trim()
    .min(1, { message: 'Character slug cannot be empty' })
    .max(191, { message: 'Character slug is too long' })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Character slug format is invalid' })
    .optional(),
  useExactTextAsScript: z.boolean().optional(),
  templateId: z.string().uuid().optional(),
  voiceId: z.string().max(128).optional().or(z.literal('')).transform((v) => v || undefined),
  languages: z
    .array(LANGUAGE_ENUM)
    .min(1, { message: 'Select at least one language' })
    .optional(),
  languageVoices: languageVoiceRecordSchema.optional(),
  videoGeneration: videoGenerationSchema.optional(),
  characterVideoQuality: z.enum(CHARACTER_VIDEO_QUALITIES).optional(),
  projectExperience: z.enum(PROJECT_EXPERIENCES).optional(),
  contentTone: z.enum(CONTENT_TONES).optional(),
  includeDefaultMusic: z.boolean().optional(),
  addOverlay: z.boolean().optional(),
  includeCallToAction: z.boolean().optional(),
  watermarkEnabled: z.boolean().optional(),
  captionsEnabled: z.boolean().optional(),
}).superRefine((val, ctx) => {
  if (val.characterVideoQuality && val.videoGeneration?.mode) {
    const mode = normalizeCharacterVideoGenerationMode(val.videoGeneration.mode);
    const expectedMode = CHARACTER_VIDEO_QUALITY_TO_GENERATION_MODE[val.characterVideoQuality];
    if (mode && mode !== expectedMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'characterVideoQuality conflicts with videoGeneration.mode',
        path: ['characterVideoQuality'],
      });
    }
  }

  // If not using exact script mode, duration is required
  if (!val.useExactTextAsScript && (val.durationSeconds == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duration is required', path: ['durationSeconds'] });
    return;
  }

  if (val.durationSeconds == null) return;
  const isCharacter = val.projectExperience === 'character';
  const minimumDuration = isCharacter ? CHARACTER_PROJECT_TARGET_DURATION_SECONDS : 30;
  if (val.durationSeconds < minimumDuration) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Minimum duration is ${minimumDuration} seconds`,
      path: ['durationSeconds'],
    });
  }

});

export const approveScriptSchema = z.union([
  z.object({
    scripts: z
      .array(
        z.object({
          languageCode: LANGUAGE_ENUM,
          text: scriptTextSchema,
        }),
      )
      .min(1, { message: 'Provide at least one script' }),
  }),
  z.object({
    text: scriptTextSchema,
    languageCode: LANGUAGE_ENUM.optional(),
  }),
]);

const finalScriptEditTextSchema = z
  .string()
  .trim()
  .min(1, { message: 'Script cannot be empty' })
  .max(LIMITS.rawScriptMax, { message: `Script must be at most ${LIMITS.rawScriptMax} characters` });

export const finalScriptEditSchema = z.object({
  text: finalScriptEditTextSchema,
  languageCode: LANGUAGE_ENUM.optional(),
});

export const approveAudioSchema = z.union([
  z.object({
    selections: z
      .array(
        z.object({
          languageCode: LANGUAGE_ENUM,
          audioId: z.string().uuid(),
        }),
      )
      .min(1, { message: 'Provide at least one audio selection' }),
  }),
  z.object({
    audioId: z.string().uuid(),
  }),
]);

export const textRequestSchema = z.object({
  text: z.string().min(1),
  languageCode: LANGUAGE_ENUM.optional(),
  propagateTranslations: z.boolean().default(true),
});
