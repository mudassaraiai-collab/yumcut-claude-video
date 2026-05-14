"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/common/Tooltip';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProjectStatus } from '@/shared/constants/status';
import { CHARACTER_PIPELINE_ORDER, normalizeForPipelineOrdering } from '@/shared/pipeline/project-pipeline';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import { getLanguageFlag, getLanguageLabel, normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { normalizeContentTone } from '@/shared/constants/content-tone';
import { VOICE_PROVIDER_LABELS } from '@/shared/constants/voice-providers';
import type { ProjectDetailDTO } from '@/shared/types';
import { useVoices } from '@/hooks/useVoices';
import { Api } from '@/lib/api-client';
import { AlertTriangle, ArrowUpRight, Check, Clapperboard, Copy, Coins, Download, FileText, Languages, Mic, MoreVertical, Smile, Timer, Trash2, User } from 'lucide-react';
import {
  formatCharacterProjectDuration,
  getCharacterProjectCopy,
  getCharacterProjectStatusDescription,
  getCharacterProjectStatusLabel,
  getCharacterProjectToneMeta,
  getCharacterProjectVoiceTraitLabel,
} from './i18n';
import { resolveCharacterExpectedDurationSeconds } from './duration';

type CharacterProjectScreenProps = {
  project: ProjectDetailDTO;
  primaryLanguage: string;
  finalVideoUrl: string | null;
};

function getVoiceProviderLabel(provider: string | null | undefined) {
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (!normalized) return null;
  return (VOICE_PROVIDER_LABELS as Record<string, string>)[normalized] ?? provider?.trim() ?? null;
}

function getCharacterProjectProgressPercent(status: ProjectStatus) {
  if (status === ProjectStatus.Done) return 100;
  if (status === ProjectStatus.Error || status === ProjectStatus.Cancelled) return 100;

  const normalized = normalizeForPipelineOrdering(status, 'character');
  const index = normalized ? CHARACTER_PIPELINE_ORDER.indexOf(normalized) : -1;
  if (index < 0) return 8;

  return Math.round(((index + 1) / (CHARACTER_PIPELINE_ORDER.length + 1)) * 100);
}

export function CharacterProjectScreen({ project, primaryLanguage, finalVideoUrl }: CharacterProjectScreenProps) {
  const { language } = useAppLanguage();
  const t = getCharacterProjectCopy(language);
  const projectStatus = project.status as ProjectStatus;
  const isErrorStatus = projectStatus === ProjectStatus.Error;
  const projectProgressPercent = getCharacterProjectProgressPercent(projectStatus);
  const rawErrorMessage =
    (project.statusInfo && typeof (project.statusInfo as any).message === 'string' && (project.statusInfo as any).message.trim().length > 0)
      ? (project.statusInfo as any).message.trim()
      : getCharacterProjectStatusDescription(ProjectStatus.Error, language);
  const refundMessageMatch = rawErrorMessage.match(/(.*?)(Refunded\s+\d[\s\S]*)$/i);
  const errorMessage = refundMessageMatch ? refundMessageMatch[1]!.trim() : rawErrorMessage;
  const refundMessage = refundMessageMatch ? refundMessageMatch[2]!.trim() : null;
  const creation = project.creation ?? {};
  const selection = creation.characterSelection ?? null;
  const source = selection?.source ?? selection?.type ?? null;
  const characterSlug = selection?.characterSlug?.trim() || null;
  const displayName =
    (selection?.displayLabel?.trim() || selection?.variationTitle?.trim() || selection?.characterTitle?.trim() || t.selectedCharacter);
  const previewImageUrl = selection?.imageUrl?.trim() || null;
  const languages = normalizeLanguageList(creation.languages ?? primaryLanguage ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const languageVoiceAssignments = creation.languageVoiceAssignments ?? {};
  const isScriptMode = !!creation.useExactTextAsScript;
  const modeValue = isScriptMode ? t.modeScript : t.modeIdea;
  const modeExplanation = isScriptMode
    ? t.modeScriptDescription
    : t.modeIdeaDescription;
  const selectedTone = normalizeContentTone(creation.contentTone);
  const selectedToneMeta = getCharacterProjectToneMeta(selectedTone, language);
  const text = (project.prompt?.trim() || project.rawScript?.trim() || '').trim();
  const showPromptSection = text.length > 0;
  const hasFinalVideo = typeof finalVideoUrl === 'string' && finalVideoUrl.trim().length > 0;
  const videoDownloadUrl = `/api/projects/${encodeURIComponent(project.id)}/video/download?language=${encodeURIComponent(primaryLanguage)}`;
  const rawVideoDownloadUrl = `${videoDownloadUrl}&variant=raw`;
  const languageVariants = project.languageVariants ?? [];
  const primaryVariant =
    languageVariants.find((variant) => variant.languageCode === primaryLanguage)
    ?? languageVariants.find((variant) => variant.isPrimary)
    ?? languageVariants[0]
    ?? null;
  const generatedText = (
    project.finalScriptText
    ?? primaryVariant?.scriptText
    ?? (project.statusInfo as any)?.scriptText
    ?? ''
  ).trim();
  const generatedAudioUrl =
    primaryVariant?.finalVoiceoverUrl
    || primaryVariant?.finalVoiceoverPath
    || project.finalVoiceoverPath
    || (project.statusInfo && (((project.statusInfo as any).finalVoiceoverPath) || ((project.statusInfo as any).approvedAudioPath)) ? ((project.statusInfo as any).finalVoiceoverPath || (project.statusInfo as any).approvedAudioPath) as string : null)
    || null;
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedGeneratedText, setCopiedGeneratedText] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);
  const router = useRouter();
  const { getByExternalId } = useVoices();
  const maxVisibleLanguages = 3;
  const canToggleLanguages = languages.length > maxVisibleLanguages;
  const canOpenCharacterPage = source === 'global' && !!characterSlug;
  const languageVoiceRows = languages.map((code) => {
    const voiceId = languageVoiceAssignments[code as keyof typeof languageVoiceAssignments] ?? creation.voiceId ?? null;
    const voice = voiceId ? getByExternalId(voiceId) : null;
    return {
      code,
      label: `${getLanguageFlag(code)} ${getLanguageLabel(code as any)}`,
      voiceLabel: voice?.title?.trim() || voiceId || t.autoVoice,
      voice,
    };
  });
  const visibleLanguageVoiceRows = canToggleLanguages && !showAllLanguages
    ? languageVoiceRows.slice(0, maxVisibleLanguages)
    : languageVoiceRows;
  const expectedDurationSeconds = resolveCharacterExpectedDurationSeconds(isScriptMode);
  const tokensUsed = typeof project.tokensUsed === 'number' && Number.isFinite(project.tokensUsed)
    ? Math.max(0, Math.round(project.tokensUsed))
    : null;
  const metadataTitleClass = 'inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400';
  const metadataValueClass = 'text-xl font-semibold text-gray-900 dark:text-gray-100';
  const hasRawVideo = Boolean(primaryVariant?.rawVideoUrl || primaryVariant?.rawVideoPath);

  const handleCopyPrompt = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 1500);
    } catch {
      setCopiedPrompt(false);
    }
  };

  const handleCopyGeneratedText = async () => {
    if (!generatedText) return;
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopiedGeneratedText(true);
      window.setTimeout(() => setCopiedGeneratedText(false), 1500);
    } catch {
      setCopiedGeneratedText(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <Card>
        <CardHeader className="mb-0 items-start gap-2 border-b border-gray-200/80 pb-3 dark:border-gray-800/80">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
              <Clapperboard className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              {t.projectPreview}
            </span>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t.projectActions}
                  title={t.projectActions}
                  className="cursor-pointer rounded-full"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(176px,calc(100vw-1rem))] p-1">
                <div
                  role="menuitem"
                  tabIndex={0}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t.delete}</span>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white transition-all duration-200 hover:shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="relative aspect-[9/16] w-full">
                {hasFinalVideo ? (
                  <>
                    <Popover open={downloadMenuOpen} onOpenChange={setDownloadMenuOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={t.downloadVideo}
                          title={t.downloadVideo}
                          className="absolute right-2 top-2 z-20 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/70 bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-white/80"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-[min(190px,calc(100vw-1rem))] p-1">
                        <a
                          href={videoDownloadUrl}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                          onClick={() => setDownloadMenuOpen(false)}
                        >
                          <Download className="h-4 w-4" />
                          <span>{t.download}</span>
                        </a>
                        {hasRawVideo ? (
                          <a
                            href={rawVideoDownloadUrl}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                            onClick={() => setDownloadMenuOpen(false)}
                          >
                            <Download className="h-4 w-4" />
                            <span>{t.downloadRaw}</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-400"
                          >
                            <Download className="h-4 w-4" />
                            <span>{t.downloadRaw}</span>
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>
                    <video
                      src={finalVideoUrl!}
                      poster={previewImageUrl ?? undefined}
                      controls
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  </>
                ) : (
                  <div className="relative flex h-full animate-in fade-in-0 duration-300 flex-col items-center justify-center overflow-hidden bg-gray-50 p-4 text-center dark:bg-gray-900">
                    {previewImageUrl ? (
                      <>
                        <Image
                          src={previewImageUrl}
                          alt={t.characterBackgroundAlt(displayName)}
                          fill
                          sizes="(min-width: 1024px) 220px, 100vw"
                          className="pointer-events-none absolute inset-0 z-0 h-full w-full scale-110 object-cover opacity-35 blur-xl"
                        />
                        <Image
                          src={previewImageUrl}
                          alt={t.characterBackgroundAlt(displayName)}
                          fill
                          sizes="(min-width: 1024px) 220px, 100vw"
                          className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain p-2"
                        />
                        <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-white/8 via-transparent to-white/18 dark:from-gray-950/20 dark:via-transparent dark:to-gray-950/36" />
                      </>
                    ) : null}
                    {!previewImageUrl ? (
                      <>
                        <div className="pointer-events-none absolute left-6 top-14 h-32 w-32 animate-[spin_14s_linear_infinite] rounded-full bg-cyan-300/35 blur-3xl dark:bg-cyan-500/25" />
                        <div className="pointer-events-none absolute right-6 bottom-16 h-36 w-36 animate-[spin_18s_linear_infinite_reverse] rounded-full bg-blue-300/30 blur-3xl dark:bg-blue-500/25" />
                        <div className="pointer-events-none absolute left-1/2 top-[54%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 animate-[pulse_4s_ease-in-out_infinite] rounded-full bg-violet-300/25 blur-2xl dark:bg-violet-500/20" />
                        <div className="pointer-events-none absolute left-8 bottom-10 h-24 w-24 animate-[pulse_5s_ease-in-out_infinite] rounded-full bg-fuchsia-300/25 blur-3xl dark:bg-fuchsia-500/18" />
                        <div className="pointer-events-none absolute right-8 top-12 h-24 w-24 animate-[pulse_5.5s_ease-in-out_infinite] rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/15" />
                        <div className="pointer-events-none absolute left-1/3 top-8 h-20 w-20 animate-[pulse_4.6s_ease-in-out_infinite] rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/18" />
                        <div className="pointer-events-none absolute right-1/4 bottom-8 h-20 w-20 animate-[pulse_4.9s_ease-in-out_infinite] rounded-full bg-rose-300/25 blur-3xl dark:bg-rose-500/18" />
                      </>
                    ) : null}

                    <div className="relative z-10 rounded-2xl border border-white/75 bg-white/65 px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.16)] backdrop-blur-md dark:border-gray-700/70 dark:bg-gray-900/60">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-gray-300/85 bg-white/90 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80">
                        <Clapperboard className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                      </div>
                      <div
                        className="mx-auto mb-2 h-1.5 w-28 overflow-hidden rounded-full border border-gray-300/70 bg-white/80 dark:border-gray-700/80 dark:bg-gray-800/85"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={projectProgressPercent}
                      >
                        <div
                          className="h-full rounded-full bg-gray-600/90 transition-[width] duration-700 ease-out dark:bg-gray-200/95"
                          style={{ width: `${projectProgressPercent}%` }}
                        />
                      </div>
                      <Tooltip content={getCharacterProjectStatusDescription(projectStatus, language)} side="top" align="center">
                        {isErrorStatus ? (
                          <button
                            type="button"
                            className="cursor-pointer text-sm font-semibold text-red-600 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)] transition hover:text-red-700 dark:text-red-400 dark:drop-shadow-none dark:hover:text-red-300"
                            onClick={() => setErrorDetailsOpen(true)}
                          >
                            {getCharacterProjectStatusLabel(projectStatus, language)}
                          </button>
                        ) : (
                          <div className="cursor-help text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {getCharacterProjectStatusLabel(projectStatus, language)}
                          </div>
                        )}
                      </Tooltip>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <section className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 pt-0">
              <div className="space-y-6">
                <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
                  <div className="space-y-6">
                    <div>
                      <div className={metadataTitleClass}>
                        <User className="h-4 w-4" />
                        {t.character}
                      </div>
                      <div className="mt-2">
                        {canOpenCharacterPage ? (
                          <Link
                            href={`/character/${characterSlug}`}
                            className={`inline-flex max-w-full cursor-pointer items-center gap-2 ${metadataValueClass} transition hover:text-gray-700 dark:hover:text-gray-300`}
                            title={t.openCharacter(displayName)}
                          >
                            <span className="max-w-[320px] truncate sm:max-w-[420px]">{displayName}</span>
                            <ArrowUpRight className="h-4 w-4 shrink-0" />
                          </Link>
                        ) : (
                          <span className={`inline-flex max-w-full items-center ${metadataValueClass}`}>
                            <span className="max-w-[320px] truncate sm:max-w-[420px]">{displayName}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className={metadataTitleClass}>
                        <FileText className="h-4 w-4" />
                        {t.mode}
                      </div>
                      <div className={`mt-2 ${metadataValueClass}`}>
                        <Tooltip content={modeExplanation}>
                          <span className="cursor-help underline decoration-gray-300 decoration-dotted underline-offset-4 dark:decoration-gray-600">
                            {modeValue}
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                    <div>
                      <div className={metadataTitleClass}>
                        <Languages className="h-4 w-4" />
                        {t.languagesAndVoices}
                      </div>
                      <div className="mt-3 space-y-2.5">
                        {visibleLanguageVoiceRows.map((row) => (
                          <div key={row.code} className="flex items-center gap-3">
                            <span className={`inline-flex items-center gap-2 whitespace-nowrap ${metadataValueClass}`}>
                              <span className="text-xl leading-none">{getLanguageFlag(row.code)}</span>
                              <span>{getLanguageLabel(row.code as any)}</span>
                            </span>
                            <Tooltip
                              disabled={!row.voice}
                              side="top"
                              align="start"
                              content={row.voice ? (
                                <div className="space-y-1 text-xs">
                                  <div className="font-medium text-white">{row.voice.title}</div>
                                  <div className="text-white/80">
                                    {t.provider}: {getVoiceProviderLabel(row.voice.voiceProvider) ?? t.unknownProvider}
                                  </div>
                                  {(row.voice.gender || row.voice.speed) ? (
                                    <div className="text-white/70">
                                      {[row.voice.gender, row.voice.speed]
                                        .map((entry) => getCharacterProjectVoiceTraitLabel(entry, language))
                                        .filter((entry): entry is string => !!entry)
                                        .join(' · ')}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            >
                              <span className={`cursor-help whitespace-nowrap ${metadataValueClass} underline decoration-gray-300 decoration-dotted underline-offset-4 dark:decoration-gray-600`}>
                                {row.voiceLabel}
                              </span>
                            </Tooltip>
                          </div>
                        ))}
                        {canToggleLanguages ? (
                          <button
                            type="button"
                            className="inline-flex cursor-pointer items-center text-xs font-medium text-blue-700 transition hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                            onClick={() => setShowAllLanguages((prev) => !prev)}
                          >
                            {showAllLanguages ? t.showLess : t.showMoreLanguages(languages.length - maxVisibleLanguages)}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <div className={metadataTitleClass}>
                        <Timer className="h-4 w-4" />
                        {t.expectedDuration}
                      </div>
                      <div className={`mt-2 ${metadataValueClass}`}>
                        {formatCharacterProjectDuration(expectedDurationSeconds, language)}
                      </div>
                    </div>
                    <div>
                      <div className={metadataTitleClass}>
                        <Smile className="h-4 w-4" />
                        {t.emotion}
                      </div>
                      <div className={`mt-2 ${metadataValueClass}`}>
                        <span className="mr-2" aria-hidden="true">{selectedToneMeta.emoji}</span>
                        {selectedToneMeta.label}
                      </div>
                    </div>
                    <div>
                      <div className={metadataTitleClass}>
                        <Coins className="h-4 w-4" />
                        {t.tokensSpent}
                      </div>
                      <div className={`mt-2 ${metadataValueClass}`}>
                        {tokensUsed != null ? `${tokensUsed.toLocaleString()} ${t.tokensUnit}` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {showPromptSection ? (
            <section className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 rounded-lg border border-gray-200 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-950/50">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  {t.yourPrompt}
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="inline-flex cursor-pointer items-center gap-1.5"
                  onClick={handleCopyPrompt}
                >
                  {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedPrompt ? t.copied : t.copy}
                </Button>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">
                {text}
              </div>
            </section>
          ) : null}

          {generatedText ? (
            <section className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 rounded-lg border border-gray-200 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-950/50">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  {t.generatedText}
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="inline-flex cursor-pointer items-center gap-1.5"
                  onClick={handleCopyGeneratedText}
                >
                  {copiedGeneratedText ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedGeneratedText ? t.copied : t.copy}
                </Button>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">
                {generatedText}
              </div>
            </section>
          ) : null}

          {generatedAudioUrl ? (
            <section className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 rounded-lg border border-gray-200 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-950/50">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <Mic className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  {t.generatedAudio}
                </h3>
              </div>
              <audio controls preload="metadata" className="w-full" src={generatedAudioUrl} />
            </section>
          ) : null}

        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.deleteProjectTitle}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t.deleteProjectDescription}
          </DialogDescription>
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm leading-5">
              {t.deleteProjectWarning}
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" className="cursor-pointer">{t.cancel}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
                try {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('project:deleted', { detail: { projectId: project.id } }));
                  }
                  await Api.deleteProject(project.id);
                  setConfirmOpen(false);
                  router.push('/');
                } catch (_) {
                  setConfirmOpen(false);
                  router.refresh();
                }
              }}
            >
              {t.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={errorDetailsOpen} onOpenChange={setErrorDetailsOpen}>
        <DialogContent className="max-w-xl overflow-hidden p-0">
          <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/60">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/35 dark:text-red-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t.processingError}
            </div>
            <DialogHeader className="mb-0 mt-3 pr-8">
              <DialogTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">{t.projectRunInterrupted}</DialogTitle>
              <DialogDescription>
                {t.projectFailedDetails}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t.errorDetails}</p>
              <p className="mt-1 text-sm leading-6 text-gray-900 dark:text-gray-100">{errorMessage}</p>
            </div>
            {refundMessage ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                {refundMessage}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end border-t border-gray-200 px-4 py-3 dark:border-gray-800">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="cursor-pointer">{t.close}</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
