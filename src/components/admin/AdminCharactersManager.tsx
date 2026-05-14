"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUp, Copy, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react';
import { Api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ADMIN_CHARACTER_IMPORT_VALIDATION_LIMITS,
  type AdminCharacterImportRowValidationResult,
  type AdminCharacterImportValidationLimits,
  validateAdminCharacterImportRow,
} from '@/shared/validators/admin-character-import';
import { parseAdminCharacterInfoPayload, type ParsedAdminCharacterInfo } from '@/shared/validators/admin-character-info';

type Category = {
  id: string;
  slug: string;
  titleEn: string;
  titleRu: string;
  isActive: boolean;
  priority: number;
};

type ImportRow = {
  key: string;
  sourcePath: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  isPublic: boolean;
  preparedFile: File;
  emptyFile: File;
  preparedPreviewUrl: string;
};

type ImportValidationProgress = {
  total: number;
  checked: number;
  current: string | null;
  running: boolean;
};

type CatalogRow = {
  id: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  isPublic: boolean;
  priority: number;
  categoryId: string | null;
  preparedImageUrl: string | null;
  emptyImageUrl: string | null;
  previewVideoUrl: string | null;
  previewVideoHasAudio: boolean;
};

type PendingCatalogVideo = {
  file: File;
  previewUrl: string;
  previousUrl: string | null;
};

type PriorityCheckResult = {
  categoryId: string;
  normalizedSlugs: string[];
  existingSlugs: string[];
  missingSlugs: string[];
  existingCount: number;
  missingCount: number;
};
const CATALOG_PAGE_SIZE_OPTIONS = [30, 50, 100, 300, 500] as const;
const DEFAULT_CATALOG_PAGE_SIZE = 30;
const IMPORT_UPLOAD_BATCH_SIZE = 50;
const CATALOG_PAGE_SIZE_STORAGE_KEY = 'admin.characters.catalog.pageSize';

function loadInitialCatalogPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_CATALOG_PAGE_SIZE;
  const raw = window.localStorage.getItem(CATALOG_PAGE_SIZE_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CATALOG_PAGE_SIZE;
  return CATALOG_PAGE_SIZE_OPTIONS.includes(parsed as (typeof CATALOG_PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_CATALOG_PAGE_SIZE;
}

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePrioritySlugs(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const slug = toSlug(line);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }

  return result;
}

function filePathOf(file: File): string {
  return ((file as any).webkitRelativePath as string) || file.name;
}

function pathBaseName(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function normalizeRowFromPath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

async function parseInfoJson(file: File | undefined): Promise<ParsedAdminCharacterInfo | null> {
  if (!file) return null;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as any;
    return parseAdminCharacterInfoPayload(parsed);
  } catch {
    return null;
  }
}

export function AdminCharactersManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [catalogRows, setCatalogRows] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState('');
  const [catalogCategoryId, setCatalogCategoryId] = useState<string>('__all__');
  const [catalogPageSize, setCatalogPageSize] = useState<number>(loadInitialCatalogPageSize);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [suggestedCategorySlug, setSuggestedCategorySlug] = useState('');
  const [progress, setProgress] = useState<{ total: number; done: number; skipped: number; current: string | null }>({
    total: 0,
    done: 0,
    skipped: 0,
    current: null,
  });
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDraftSlug, setCategoryDraftSlug] = useState('');
  const [categoryDraftTitle, setCategoryDraftTitle] = useState('');
  const [categoryEditId, setCategoryEditId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [catalogRowPending, setCatalogRowPending] = useState<Record<string, 'save' | 'delete' | 'deleteVideo' | 'moveTop' | null>>({});
  const [catalogSlugErrors, setCatalogSlugErrors] = useState<Record<string, string | null>>({});
  const [catalogSlugChecking, setCatalogSlugChecking] = useState<Record<string, boolean>>({});
  const [pendingCatalogVideos, setPendingCatalogVideos] = useState<Record<string, PendingCatalogVideo>>({});
  const pendingCatalogVideosRef = useRef<Record<string, PendingCatalogVideo>>({});
  const [selectedImportKeys, setSelectedImportKeys] = useState<Record<string, boolean>>({});
  const [selectedCatalogKeys, setSelectedCatalogKeys] = useState<Record<string, boolean>>({});
  const [deleteCatalogWithFiles, setDeleteCatalogWithFiles] = useState(false);
  const [updatingSelectedCatalogVisibility, setUpdatingSelectedCatalogVisibility] = useState(false);
  const [pickedImportFileCount, setPickedImportFileCount] = useState(0);
  const [deletingSelectedCatalog, setDeletingSelectedCatalog] = useState(false);
  const [importValidationLimits, setImportValidationLimits] = useState<AdminCharacterImportValidationLimits>(ADMIN_CHARACTER_IMPORT_VALIDATION_LIMITS);
  const [loadingImportValidationLimits, setLoadingImportValidationLimits] = useState(false);
  const [importValidationProgress, setImportValidationProgress] = useState<ImportValidationProgress>({
    total: 0,
    checked: 0,
    current: null,
    running: false,
  });
  const [importRowValidation, setImportRowValidation] = useState<Record<string, AdminCharacterImportRowValidationResult>>({});
  const [priorityCategoryId, setPriorityCategoryId] = useState<string>('');
  const [priorityInputMode, setPriorityInputMode] = useState<'file' | 'manual'>('file');
  const [priorityFileSlugsRaw, setPriorityFileSlugsRaw] = useState('');
  const [priorityFileName, setPriorityFileName] = useState('');
  const [priorityManualSlugsRaw, setPriorityManualSlugsRaw] = useState('');
  const [priorityCheckResult, setPriorityCheckResult] = useState<PriorityCheckResult | null>(null);
  const [priorityCheckedSignature, setPriorityCheckedSignature] = useState<string | null>(null);
  const [checkingPriorities, setCheckingPriorities] = useState(false);
  const [applyingPriorities, setApplyingPriorities] = useState(false);
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [priorityModalType, setPriorityModalType] = useState<'existing' | 'missing'>('existing');
  const importValidationRunIdRef = useRef(0);

  const progressPercent = progress.total > 0
    ? Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)))
    : 0;

  const importInvalidCount = useMemo(
    () => importRows.reduce((acc, row) => (importRowValidation[row.key]?.issues.length ? acc + 1 : acc), 0),
    [importRows, importRowValidation],
  );
  const importValidCount = useMemo(
    () => importRows.reduce((acc, row) => (importRowValidation[row.key] && importRowValidation[row.key].issues.length === 0 ? acc + 1 : acc), 0),
    [importRows, importRowValidation],
  );
  const importValidationSignature = useMemo(
    () => importRows.map((row) => [
      row.key,
      row.slug,
      row.title,
      row.bio,
      row.preparedFile.name,
      row.preparedFile.size,
      row.preparedFile.type,
      row.emptyFile.name,
      row.emptyFile.size,
      row.emptyFile.type,
    ].join('|')).join('||'),
    [importRows],
  );
  const importValidationDone = importRows.length > 0
    && !importValidationProgress.running
    && importValidationProgress.checked === importRows.length;
  const canImport = importRows.length > 0
    && !!selectedCategoryId
    && !savingImport
    && !loadingImportValidationLimits
    && importValidationDone
    && importInvalidCount === 0;
  const selectedImportCount = useMemo(
    () => importRows.reduce((acc, row) => (selectedImportKeys[row.key] ? acc + 1 : acc), 0),
    [importRows, selectedImportKeys],
  );
  const allImportSelected = importRows.length > 0 && selectedImportCount === importRows.length;
  const someImportSelected = selectedImportCount > 0 && !allImportSelected;
  const selectedCatalogCount = useMemo(
    () => catalogRows.reduce((acc, row) => (selectedCatalogKeys[row.id] ? acc + 1 : acc), 0),
    [catalogRows, selectedCatalogKeys],
  );
  const allCatalogSelected = catalogRows.length > 0 && selectedCatalogCount === catalogRows.length;
  const someCatalogSelected = selectedCatalogCount > 0 && !allCatalogSelected;

  const categoryOptions = useMemo(() => categories.filter((entry) => entry.isActive), [categories]);
  const activePrioritySlugsRaw = priorityInputMode === 'manual' ? priorityManualSlugsRaw : priorityFileSlugsRaw;
  const parsedPrioritySlugs = useMemo(
    () => parsePrioritySlugs(activePrioritySlugsRaw),
    [activePrioritySlugsRaw],
  );
  const priorityInputSignature = useMemo(
    () => `${priorityCategoryId}|${parsedPrioritySlugs.join('\n')}`,
    [priorityCategoryId, parsedPrioritySlugs],
  );
  const hasPriorityInput = parsedPrioritySlugs.length > 0;
  const canCheckPriorities = !!priorityCategoryId && hasPriorityInput && !checkingPriorities && !applyingPriorities;
  const canApplyPriorities = !!priorityCheckResult
    && priorityCheckedSignature === priorityInputSignature
    && !checkingPriorities
    && !applyingPriorities;

  useEffect(() => {
    pendingCatalogVideosRef.current = pendingCatalogVideos;
  }, [pendingCatalogVideos]);

  async function loadCategories() {
    setLoadingCategories(true);
    try {
      const response = await Api.adminCharacterCategoriesList();
      setCategories(response.items || []);
      if (!selectedCategoryId && response.items?.length) {
        setSelectedCategoryId(response.items[0].id);
      }
      if (!priorityCategoryId && response.items?.length) {
        setPriorityCategoryId(response.items[0].id);
      }
    } catch (err) {
      console.error('Failed to load categories', err);
    } finally {
      setLoadingCategories(false);
    }
  }

  async function loadCatalog(next?: { search?: string; categoryId?: string; page?: number; pageSize?: number }) {
    setLoadingCatalog(true);
    try {
      setPendingCatalogVideos((prev) => {
        for (const pending of Object.values(prev)) {
          URL.revokeObjectURL(pending.previewUrl);
        }
        return {};
      });
      const effectiveSearch = next?.search ?? search;
      const effectiveCategoryId = next?.categoryId ?? catalogCategoryId;
      const effectivePage = next?.page ?? catalogPage;
      const effectivePageSize = next?.pageSize ?? catalogPageSize;
      const response = await Api.adminCharactersList({
        q: effectiveSearch,
        categoryId: effectiveCategoryId === '__all__' ? null : effectiveCategoryId,
        page: effectivePage,
        pageSize: effectivePageSize,
      });
      const rows = (response.items || []).map((entry) => ({
        id: entry.id,
        slug: entry.slug || '',
        name: entry.name,
        title: entry.title,
        bio: entry.bio || '',
        isPublic: entry.isPublic,
        priority: entry.priority,
        categoryId: entry.category?.id || null,
        preparedImageUrl: entry.preparedImageUrl,
        emptyImageUrl: entry.emptyImageUrl,
        previewVideoUrl: entry.previewVideoUrl,
        previewVideoHasAudio: entry.previewVideoHasAudio !== false,
      }));
      setCatalogRows(rows);
      setCatalogSlugErrors({});
      setCatalogSlugChecking({});
      setCatalogTotalPages(response.totalPages || 1);
      setCatalogTotal(response.total || 0);
      setCatalogPage(response.page || 1);
      setSelectedCatalogKeys({});
    } catch (err) {
      console.error('Failed to load characters', err);
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => {
    return () => {
      for (const pending of Object.values(pendingCatalogVideosRef.current)) {
        URL.revokeObjectURL(pending.previewUrl);
      }
    };
  }, []);

  async function loadImportValidationLimits() {
    setLoadingImportValidationLimits(true);
    try {
      const response = await Api.adminCharacterImportValidationLimits();
      if (response?.limits) {
        setImportValidationLimits(response.limits);
      }
    } catch (err) {
      console.error('Failed to load import validation limits', err);
      toast.error('Failed to load import validation limits', {
        description: 'Using fallback validation limits.',
      });
      setImportValidationLimits(ADMIN_CHARACTER_IMPORT_VALIDATION_LIMITS);
    } finally {
      setLoadingImportValidationLimits(false);
    }
  }

  async function runImportPrecheck(rows: ImportRow[], limits: AdminCharacterImportValidationLimits) {
    const runId = importValidationRunIdRef.current + 1;
    importValidationRunIdRef.current = runId;

    if (!rows.length) {
      setImportValidationProgress({
        total: 0,
        checked: 0,
        current: null,
        running: false,
      });
      setImportRowValidation({});
      return;
    }

    setImportValidationProgress({
      total: rows.length,
      checked: 0,
      current: null,
      running: true,
    });

    const nextValidation: Record<string, AdminCharacterImportRowValidationResult> = {};
    const mergeIssue = (
      base: AdminCharacterImportRowValidationResult,
      issue: { field: 'slug' | 'name' | 'title' | 'bio' | 'preparedFile' | 'emptyFile'; message: string },
    ): AdminCharacterImportRowValidationResult => {
      if (base.issues.some((entry) => entry.field === issue.field && entry.message === issue.message)) {
        return base;
      }
      const issues = [...base.issues, issue];
      const fieldErrors: Partial<Record<'slug' | 'name' | 'title' | 'bio' | 'preparedFile' | 'emptyFile', string>> = {};
      for (const entry of issues) {
        if (!fieldErrors[entry.field]) fieldErrors[entry.field] = entry.message;
      }
      return {
        ...base,
        issues,
        fieldErrors,
      };
    };
    for (let i = 0; i < rows.length; i += 1) {
      if (importValidationRunIdRef.current !== runId) {
        return;
      }
      const row = rows[i];
      const result = validateAdminCharacterImportRow({
        slug: row.slug,
        name: row.title,
        title: row.title,
        bio: row.bio,
        preparedFile: {
          name: row.preparedFile.name,
          size: row.preparedFile.size,
          type: row.preparedFile.type,
        },
        emptyFile: {
          name: row.emptyFile.name,
          size: row.emptyFile.size,
          type: row.emptyFile.type,
        },
      }, limits);
      nextValidation[row.key] = result;

      const checked = i + 1;
      setImportValidationProgress({
        total: rows.length,
        checked,
        current: row.slug || row.title || row.sourcePath,
        running: checked < rows.length,
      });

      if (i % 8 === 0) {
        // Give the browser a chance to paint progress for large batches.
        await Promise.resolve();
      }
    }

    if (selectedCategoryId) {
      const BATCH_SIZE = 100;
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        if (importValidationRunIdRef.current !== runId) return;
        const end = Math.min(rows.length, start + BATCH_SIZE);
        const batch = rows.slice(start, end);
        const labelStart = start + 1;
        const labelEnd = end;
        setImportValidationProgress({
          total: rows.length,
          checked: end,
          current: `DB precheck ${labelStart}-${labelEnd}`,
          running: true,
        });

        try {
          const response = await Api.adminCharacterImportPrecheck({
            categoryId: selectedCategoryId,
            rows: batch.map((row) => ({
              key: row.key,
              slug: row.slug,
              name: row.title,
              title: row.title,
              bio: row.bio,
            })),
          });

          for (const item of response.items || []) {
            const current = nextValidation[item.key];
            if (!current) continue;
            let merged = current;
            for (const issue of item.issues || []) {
              merged = mergeIssue(merged, issue);
            }
            nextValidation[item.key] = merged;
          }
        } catch (err) {
          console.error('Failed DB import precheck batch', err);
          for (const row of batch) {
            const current = nextValidation[row.key];
            if (!current) continue;
            nextValidation[row.key] = mergeIssue(current, {
              field: 'slug',
              message: 'Failed DB precheck for this row',
            });
          }
        }
      }
    }

    if (importValidationRunIdRef.current !== runId) {
      return;
    }

    setImportRowValidation(nextValidation);
    setImportValidationProgress({
      total: rows.length,
      checked: rows.length,
      current: null,
      running: false,
    });
  }

  useEffect(() => {
    void loadImportValidationLimits();
    void loadCategories();
    void loadCatalog({ search: '', categoryId: '__all__', page: 1 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCatalog({ search, categoryId: catalogCategoryId, page: 1 });
    }, 240);
    return () => clearTimeout(timer);
  }, [search, catalogCategoryId, catalogPageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      window.localStorage.setItem(CATALOG_PAGE_SIZE_STORAGE_KEY, String(catalogPageSize));
    } catch {}
  }, [catalogPageSize]);

  useEffect(() => {
    void runImportPrecheck(importRows, importValidationLimits);
  }, [importValidationSignature, importValidationLimits, selectedCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPriorityCheckedSignature((prev) => (prev === priorityInputSignature ? prev : null));
    setPriorityCheckResult((prev) => (prev && priorityCheckedSignature === priorityInputSignature ? prev : null));
  }, [priorityInputSignature, priorityCheckedSignature]);

  async function onPickPriorityFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setPriorityFileSlugsRaw(text);
      setPriorityFileName(file.name);
      toast.success(`Loaded ${file.name}`);
    } catch (err) {
      console.error('Failed to read slugs file', err);
      toast.error('Failed to read slugs file');
    }
  }

  function openPriorityModal(type: 'existing' | 'missing') {
    setPriorityModalType(type);
    setPriorityModalOpen(true);
  }

  async function checkPrioritySlugs() {
    if (!canCheckPriorities) return;
    setCheckingPriorities(true);
    try {
      const response = await Api.adminCharacterPrioritiesCheck({
        categoryId: priorityCategoryId,
        slugs: parsedPrioritySlugs,
      });
      setPriorityCheckResult(response);
      setPriorityCheckedSignature(priorityInputSignature);
      toast.success('Check completed', {
        description: `Exists: ${response.existingCount} · Missing: ${response.missingCount}`,
      });
    } catch (err) {
      console.error('Failed to check priorities', err);
      setPriorityCheckResult(null);
      setPriorityCheckedSignature(null);
    } finally {
      setCheckingPriorities(false);
    }
  }

  async function applyPriorities() {
    if (!canApplyPriorities) return;
    setApplyingPriorities(true);
    try {
      const response = await Api.adminCharacterPrioritiesApply({
        categoryId: priorityCategoryId,
        slugs: parsedPrioritySlugs,
      });
      setPriorityCheckResult({
        categoryId: response.categoryId,
        normalizedSlugs: response.normalizedSlugs,
        existingSlugs: response.existingSlugs,
        missingSlugs: response.missingSlugs,
        existingCount: response.existingSlugs.length,
        missingCount: response.missingSlugs.length,
      });
      setPriorityCheckedSignature(priorityInputSignature);
      await loadCatalog({ search, categoryId: catalogCategoryId, page: catalogPage });
      toast.success('Priorities applied', {
        description: `Updated ${response.updatedCount} item(s), top priority ${response.highestPriority}.`,
      });
    } catch (err) {
      console.error('Failed to apply priorities', err);
    } finally {
      setApplyingPriorities(false);
    }
  }

  async function copySlugToClipboard(slug: string) {
    const value = slug.trim();
    if (!value) {
      toast.error('Slug is empty');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Slug copied');
    } catch (err) {
      console.error('Failed to copy slug', err);
      toast.error('Failed to copy slug');
    }
  }

  async function onPickFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    setPickedImportFileCount(files.length);
    if (!files.length) {
      setImportRows([]);
      setSelectedImportKeys({});
      return;
    }

    const groups = new Map<string, { prepared?: File; empty?: File; info?: File }>();
    for (const file of files) {
      const rel = normalizeRowFromPath(filePathOf(file));
      const preparedMatch = rel.match(/^(.*)\/original\/prepared\.webp$/i);
      if (preparedMatch) {
        const key = normalizeRowFromPath(preparedMatch[1] || '');
        const group = groups.get(key) || {};
        group.prepared = file;
        groups.set(key, group);
        continue;
      }

      const emptyMatch = rel.match(/^(.*)\/original\/empty\.webp$/i);
      if (emptyMatch) {
        const key = normalizeRowFromPath(emptyMatch[1] || '');
        const group = groups.get(key) || {};
        group.empty = file;
        groups.set(key, group);
        continue;
      }

      const infoMatch = rel.match(/^(.*)\/info\.json$/i);
      if (infoMatch) {
        const key = normalizeRowFromPath(infoMatch[1] || '');
        const group = groups.get(key) || {};
        group.info = file;
        groups.set(key, group);
      }
    }

    const rows: ImportRow[] = [];
    for (const [groupPath, group] of groups.entries()) {
      if (!group.prepared || !group.empty) continue;
      const info = await parseInfoJson(group.info);
      const folderBase = pathBaseName(groupPath);
      const suggestedSlug = toSlug((info?.slug || folderBase || 'character').toString());
      const suggestedTitle = (info?.title || info?.name || folderBase || suggestedSlug).toString();
      const previewUrl = URL.createObjectURL(group.prepared);

      rows.push({
        key: groupPath,
        sourcePath: groupPath,
        slug: suggestedSlug,
        name: suggestedTitle,
        title: suggestedTitle,
        bio: (info?.bio || '').toString(),
        isPublic: false,
        preparedFile: group.prepared,
        emptyFile: group.empty,
        preparedPreviewUrl: previewUrl,
      });
    }

    if (!rows.length) {
      toast.error('No valid characters found', {
        description: 'Expected each character folder to include original/prepared.webp and original/empty.webp',
      });
    }

    const firstRel = normalizeRowFromPath(filePathOf(files[0]));
    const firstSegment = firstRel.split('/').filter(Boolean)[0] || '';
    setSuggestedCategorySlug(toSlug(firstSegment));
    setImportRows(rows);
    setSelectedImportKeys({});
  }

  function updateImportRow(key: string, patch: Partial<ImportRow>) {
    setImportRows((prev) => prev.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
        next.name = (patch.title ?? row.title);
      }
      return next;
    }));
  }

  function setImportRowSelected(key: string, checked: boolean) {
    setSelectedImportKeys((prev) => ({ ...prev, [key]: checked }));
  }

  function setAllImportRowsSelected(checked: boolean) {
    if (!checked) {
      setSelectedImportKeys({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const row of importRows) next[row.key] = true;
    setSelectedImportKeys(next);
  }

  function setSelectedImportVisibility(nextVisibility: boolean) {
    if (selectedImportCount === 0) return;
    setImportRows((prev) => prev.map((row) => (
      selectedImportKeys[row.key]
        ? { ...row, isPublic: nextVisibility }
        : row
    )));
  }

  async function saveImportBatch() {
    if (!canImport) {
      if (importInvalidCount > 0) {
        toast.error('Fix validation errors before upload', {
          description: `${importInvalidCount} row(s) still have validation issues.`,
        });
      }
      return;
    }

    setSavingImport(true);
    setProgress({ total: importRows.length, done: 0, skipped: 0, current: null });

    try {
      let done = 0;
      let skipped = 0;
      const totalBatches = Math.max(1, Math.ceil(importRows.length / IMPORT_UPLOAD_BATCH_SIZE));
      for (let start = 0; start < importRows.length; start += IMPORT_UPLOAD_BATCH_SIZE) {
        const batchIdx = Math.floor(start / IMPORT_UPLOAD_BATCH_SIZE);
        const batch = importRows.slice(start, start + IMPORT_UPLOAD_BATCH_SIZE);
        setProgress({
          total: importRows.length,
          done,
          skipped,
          current: `Batch ${batchIdx + 1}/${totalBatches} (${batch.length} items)`,
        });

        await Promise.all(batch.map(async (row) => {
          const rowLabel = row.slug || row.name;
          try {
            const result = await Api.adminCharacterImport({
              categoryId: selectedCategoryId,
              slug: row.slug,
              name: row.title,
              title: row.title,
              bio: row.bio,
              isPublic: row.isPublic,
              prepared: row.preparedFile,
              empty: row.emptyFile,
            });
            if (result.status === 'saved') done += 1;
            else skipped += 1;
          } catch (err) {
            console.error('Failed to import row', row.slug, err);
            skipped += 1;
          } finally {
            setProgress({
              total: importRows.length,
              done,
              skipped,
              current: `${rowLabel} (batch ${batchIdx + 1}/${totalBatches})`,
            });
          }
        }));
      }

      toast.success('Import finished', {
        description: `${done} saved, ${skipped} skipped`,
      });
      await loadCatalog({ search, categoryId: catalogCategoryId, page: catalogPage });
    } finally {
      setSavingImport(false);
      setTimeout(() => {
        setProgress({ total: 0, done: 0, skipped: 0, current: null });
      }, 1800);
    }
  }

  async function saveCategory() {
    if (!categoryDraftSlug.trim() || !categoryDraftTitle.trim()) {
      toast.error('Category slug and title are required');
      return;
    }

    setSavingCategory(true);
    try {
      if (categoryEditId) {
        await Api.adminCharacterCategoriesUpdate(categoryEditId, {
          slug: categoryDraftSlug,
          title: categoryDraftTitle,
        });
      } else {
        await Api.adminCharacterCategoriesCreate({
          slug: categoryDraftSlug,
          title: categoryDraftTitle,
        });
      }
      await loadCategories();
      setCategoryDialogOpen(false);
      setCategoryEditId(null);
      setCategoryDraftSlug('');
      setCategoryDraftTitle('');
      toast.success('Category saved');
    } finally {
      setSavingCategory(false);
    }
  }

  function openCreateCategory() {
    setCategoryEditId(null);
    setCategoryDraftSlug(suggestedCategorySlug || '');
    setCategoryDraftTitle(suggestedCategorySlug || '');
    setCategoryDialogOpen(true);
  }

  function openEditCategory(category: Category) {
    setCategoryEditId(category.id);
    setCategoryDraftSlug(category.slug);
    setCategoryDraftTitle(category.titleEn);
    setCategoryDialogOpen(true);
  }

  async function validateCatalogRowSlug(row: CatalogRow): Promise<boolean> {
    const normalizedSlug = toSlug(row.slug);
    if (!normalizedSlug) {
      setCatalogSlugErrors((prev) => ({ ...prev, [row.id]: 'Slug is required' }));
      return false;
    }

    setCatalogSlugChecking((prev) => ({ ...prev, [row.id]: true }));
    try {
      const response = await Api.adminCharacterCheckSlug({
        slug: normalizedSlug,
        categoryId: row.categoryId,
        excludeId: row.id,
      });

      setCatalogRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, slug: response.normalizedSlug } : item)));
      if (!response.available) {
        setCatalogSlugErrors((prev) => ({ ...prev, [row.id]: 'This slug is already used in this category' }));
        return false;
      }

      setCatalogSlugErrors((prev) => ({ ...prev, [row.id]: null }));
      return true;
    } catch {
      setCatalogSlugErrors((prev) => ({ ...prev, [row.id]: 'Failed to validate slug' }));
      return false;
    } finally {
      setCatalogSlugChecking((prev) => ({ ...prev, [row.id]: false }));
    }
  }

  async function saveCatalogRow(row: CatalogRow) {
    if (!row.categoryId) {
      toast.error('Category is required');
      return;
    }
    const slugOk = await validateCatalogRowSlug(row);
    if (!slugOk) return;

    setCatalogRowPending((prev) => ({ ...prev, [row.id]: 'save' }));
    try {
      const pendingVideo = pendingCatalogVideos[row.id] ?? null;
      const normalizedSlug = toSlug(row.slug);
      await Api.adminCharacterUpdate(row.id, {
        slug: normalizedSlug,
        name: row.name,
        title: row.title,
        bio: row.bio,
        isPublic: row.isPublic,
        priority: row.priority,
        categoryId: row.categoryId,
        previewVideoHasAudio: row.previewVideoHasAudio,
      });
      if (pendingVideo) {
        const response = await Api.adminCharacterUploadVideo(row.id, pendingVideo.file, {
          hasAudio: row.previewVideoHasAudio,
        });
        URL.revokeObjectURL(pendingVideo.previewUrl);
        setPendingCatalogVideos((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        setCatalogRows((prev) => prev.map((item) => (item.id === row.id ? {
          ...item,
          slug: normalizedSlug,
          previewVideoUrl: response.previewVideoUrl,
        } : item)));
      } else {
        setCatalogRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, slug: normalizedSlug } : item)));
      }
      toast.success('Character saved');
    } finally {
      setCatalogRowPending((prev) => ({ ...prev, [row.id]: null }));
    }
  }

  async function moveCatalogRowToTop(row: CatalogRow) {
    if (!row.categoryId) {
      toast.error('Category is required');
      return;
    }

    setCatalogRowPending((prev) => ({ ...prev, [row.id]: 'moveTop' }));
    try {
      const { highestPriority, nextPriority } = await Api.adminCharacterNextPriority({
        categoryId: row.categoryId,
      });
      const confirmed = window.confirm(
        `Set priority for "${row.name}" to ${nextPriority} (current highest: ${highestPriority})?`,
      );
      if (!confirmed) return;

      await Api.adminCharacterUpdate(row.id, {
        priority: nextPriority,
        categoryId: row.categoryId,
      });
      setCatalogRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, priority: nextPriority } : item)));
      toast.success(`Priority set to ${nextPriority}`);
    } catch (err) {
      console.error('Failed to move character to top', err);
      toast.error('Failed to move character to top');
    } finally {
      setCatalogRowPending((prev) => ({ ...prev, [row.id]: null }));
    }
  }

  async function deleteCatalogRow(id: string) {
    setCatalogRowPending((prev) => ({ ...prev, [id]: 'delete' }));
    try {
      await Api.adminCharacterDelete(id, { deleteFiles: deleteCatalogWithFiles });
      const nextTotal = Math.max(0, catalogTotal - 1);
      const nextMaxPage = Math.max(1, Math.ceil(nextTotal / catalogPageSize));
      const nextPage = Math.min(catalogPage, nextMaxPage);
      await loadCatalog({ search, categoryId: catalogCategoryId, page: nextPage });
      toast.success(deleteCatalogWithFiles ? 'Character deleted with files' : 'Character deleted from database');
    } finally {
      setCatalogRowPending((prev) => ({ ...prev, [id]: null }));
    }
  }

  function setCatalogRowSelected(id: string, checked: boolean) {
    setSelectedCatalogKeys((prev) => ({ ...prev, [id]: checked }));
  }

  function setAllCatalogRowsSelected(checked: boolean) {
    if (!checked) {
      setSelectedCatalogKeys({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const row of catalogRows) next[row.id] = true;
    setSelectedCatalogKeys(next);
  }

  async function deleteSelectedCatalogRows() {
    const selectedIds = catalogRows.filter((row) => selectedCatalogKeys[row.id]).map((row) => row.id);
    if (!selectedIds.length) return;

    const confirmed = window.confirm(
      deleteCatalogWithFiles
        ? `Delete ${selectedIds.length} selected character(s) and files?`
        : `Delete ${selectedIds.length} selected character(s) from database only?`,
    );
    if (!confirmed) return;

    setDeletingSelectedCatalog(true);
    setCatalogRowPending((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) next[id] = 'delete';
      return next;
    });

    try {
      const response = await Api.adminCharactersBulkDelete(selectedIds, { deleteFiles: deleteCatalogWithFiles });
      const deleted = Math.max(0, Number(response.deleted) || 0);
      if (deleted > 0) {
        const nextTotal = Math.max(0, catalogTotal - deleted);
        const nextMaxPage = Math.max(1, Math.ceil(nextTotal / catalogPageSize));
        const nextPage = Math.min(catalogPage, nextMaxPage);
        await loadCatalog({ search, categoryId: catalogCategoryId, page: nextPage });
      } else {
        await loadCatalog({ search, categoryId: catalogCategoryId, page: catalogPage });
      }

      toast.success(deleteCatalogWithFiles
        ? `Deleted ${deleted} character(s) with files`
        : `Deleted ${deleted} character(s) from database`);
    } catch (err) {
      console.error('Failed to bulk delete characters', err);
      toast.error('Failed to delete selected characters');
    } finally {
      setCatalogRowPending((prev) => {
        const next = { ...prev };
        for (const id of selectedIds) {
          if (next[id] === 'delete') delete next[id];
        }
        return next;
      });
      setDeletingSelectedCatalog(false);
    }
  }

  async function setSelectedCatalogVisibility(nextVisibility: boolean) {
    const selectedIds = catalogRows.filter((row) => selectedCatalogKeys[row.id]).map((row) => row.id);
    if (!selectedIds.length) return;

    setUpdatingSelectedCatalogVisibility(true);
    try {
      const response = await Api.adminCharactersBulkVisibility(selectedIds, nextVisibility);
      const updated = Math.max(0, Number(response.updated) || 0);
      await loadCatalog({ search, categoryId: catalogCategoryId, page: catalogPage });
      toast.success(`Marked ${updated} character(s) as ${nextVisibility ? 'Public' : 'Private'}`);
    } catch (err) {
      console.error('Failed to bulk update character visibility', err);
      toast.error('Failed to update selected character visibility');
    } finally {
      setUpdatingSelectedCatalogVisibility(false);
    }
  }

  function previewCatalogRowVideo(row: CatalogRow, file: File) {
    const previewUrl = URL.createObjectURL(file);
    const previousPending = pendingCatalogVideos[row.id];
    if (previousPending) {
      URL.revokeObjectURL(previousPending.previewUrl);
    }
    const previousUrl = previousPending ? previousPending.previousUrl : row.previewVideoUrl;
    setPendingCatalogVideos((prev) => ({
      ...prev,
      [row.id]: { file, previewUrl, previousUrl },
    }));
    setCatalogRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, previewVideoUrl: previewUrl } : item)));
    toast.success('Preview video selected. Click Save to upload it.');
  }

  async function deleteCatalogRowVideo(row: CatalogRow) {
    const pendingVideo = pendingCatalogVideos[row.id] ?? null;
    if (pendingVideo) {
      URL.revokeObjectURL(pendingVideo.previewUrl);
      setPendingCatalogVideos((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setCatalogRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, previewVideoUrl: pendingVideo.previousUrl } : item)));
      toast.success('Pending preview video removed');
      return;
    }

    const confirmed = window.confirm(`Delete preview video for "${row.name}"?`);
    if (!confirmed) return;

    setCatalogRowPending((prev) => ({ ...prev, [row.id]: 'deleteVideo' }));
    try {
      await Api.adminCharacterDeleteVideo(row.id);
      setCatalogRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, previewVideoUrl: null } : item)));
      toast.success('Preview video deleted');
    } finally {
      setCatalogRowPending((prev) => ({ ...prev, [row.id]: null }));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
        <p className="text-sm text-muted-foreground">Import from local folders and manage catalog visibility/categories.</p>
      </div>

      <Tabs defaultValue="import" className="w-full">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader className="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-4">
              <CardTitle className="whitespace-nowrap">Pick Local Folder</CardTitle>
            <CardDescription>Select a folder containing character subfolders with original/prepared.webp and original/empty.webp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <input
                  id="character-import-folder"
                  type="file"
                  multiple
                  onChange={onPickFolder}
                  className="hidden"
                  {...({ webkitdirectory: '' } as any)}
                />
                <Button asChild type="button" variant="outline" className="w-full cursor-pointer justify-start">
                  <label htmlFor="character-import-folder" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Choose character folder
                  </label>
                </Button>
                <div className="text-xs text-muted-foreground">
                  Picked files: {pickedImportFileCount} · Detected characters: {importRows.length}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[280px] flex-1 space-y-1">
                  <Label>Category</Label>
                  <Select value={selectedCategoryId || '__none__'} onValueChange={(value) => setSelectedCategoryId(value === '__none__' ? '' : value)}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder={loadingCategories ? 'Loading categories...' : 'Select category'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="cursor-pointer">No category selected</SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id} className="cursor-pointer">
                          {category.titleEn} ({category.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {importRows.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      className="cursor-pointer"
                      checked={allImportSelected ? true : (someImportSelected ? 'indeterminate' : false)}
                      onCheckedChange={(checked) => setAllImportRowsSelected(checked === true)}
                    />
                    <span>Select all ({selectedImportCount}/{importRows.length})</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer"
                      disabled={selectedImportCount === 0}
                      onClick={() => setSelectedImportVisibility(false)}
                    >
                      Mark selected Private
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer"
                      disabled={selectedImportCount === 0}
                      onClick={() => setSelectedImportVisibility(true)}
                    >
                      Mark selected Public
                    </Button>
                    <Button
                      type="button"
                      className="cursor-pointer"
                      disabled={!canImport}
                      onClick={saveImportBatch}
                    >
                      {savingImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Save & Upload
                    </Button>
                  </div>
                </div>
              ) : null}

              {importRows.length > 0 ? (
                <div className={`space-y-2 rounded-lg border p-3 ${
                  importValidationProgress.running
                    ? 'border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/20'
                    : importInvalidCount > 0
                      ? 'border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20'
                      : importValidationDone
                        ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20'
                        : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-transparent'
                }`}>
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>
                      {importValidationProgress.running
                        ? `Checking rows${importValidationProgress.current ? `: ${importValidationProgress.current}` : ''}`
                        : importInvalidCount > 0
                          ? `Found ${importInvalidCount} row(s) with validation errors`
                          : importValidationDone
                            ? 'Everything is OK'
                            : 'Validation pending'}
                    </span>
                    <span>{importValidationProgress.checked}/{importValidationProgress.total || importRows.length}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/80 dark:bg-black/30">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        importInvalidCount > 0
                          ? 'bg-[linear-gradient(90deg,#dc2626_0%,#ef4444_55%,#f87171_100%)]'
                          : 'bg-[linear-gradient(90deg,#1d4ed8_0%,#3b82f6_45%,#60a5fa_100%)]'
                      }`}
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            Math.round(((importValidationProgress.checked || 0) / Math.max(1, importValidationProgress.total || importRows.length)) * 100),
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-xs">
                    Valid: {importValidCount} · Invalid: {importInvalidCount}
                    {loadingImportValidationLimits ? ' · Loading limits from API…' : ''}
                  </div>
                </div>
              ) : null}

              {progress.total > 0 ? (
                <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>
                      Uploading {progress.current ? `: ${progress.current}` : ''}
                    </span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#1d4ed8_0%,#3b82f6_45%,#60a5fa_100%)] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="text-xs text-blue-900/80 dark:text-blue-100/80">Saved: {progress.done} · Skipped: {progress.skipped}</div>
                </div>
              ) : null}

              <div className="space-y-3">
                {importRows.map((row) => {
                  const rowValidation = importRowValidation[row.key];
                  const hasErrors = !!rowValidation && rowValidation.issues.length > 0;
                  const hasValidated = !!rowValidation && !importValidationProgress.running;
                  const bioLength = row.bio.length;
                  const bioWithinLimit = bioLength <= importValidationLimits.bioMax;
                  return (
                  <div
                    key={row.key}
                    className={`rounded-xl border p-3 ${
                      hasErrors
                        ? 'border-red-300 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20'
                        : hasValidated
                          ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/10'
                          : 'border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                      <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={row.preparedPreviewUrl} alt={row.title} className="h-[160px] w-full object-cover" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                              className="cursor-pointer"
                              checked={selectedImportKeys[row.key] === true}
                              onCheckedChange={(checked) => setImportRowSelected(row.key, checked === true)}
                            />
                            Select
                          </label>
                          <div className="text-xs text-muted-foreground">{row.sourcePath}</div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Slug (URL)</Label>
                            <Input value={row.slug} onChange={(e) => updateImportRow(row.key, { slug: toSlug(e.target.value) })} placeholder="slug" />
                            {rowValidation?.fieldErrors.slug ? <div className="text-xs text-red-600">{rowValidation.fieldErrors.slug}</div> : null}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Title</Label>
                            <Input value={row.title} onChange={(e) => updateImportRow(row.key, { title: e.target.value })} placeholder="title" />
                            {rowValidation?.fieldErrors.title ? <div className="text-xs text-red-600">{rowValidation.fieldErrors.title}</div> : null}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Visibility</Label>
                            <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                              <Switch className="cursor-pointer" checked={row.isPublic} onCheckedChange={(checked) => updateImportRow(row.key, { isPublic: checked })} />
                              <span>{row.isPublic ? 'Public' : 'Private'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Short Description (optional)</Label>
                          <Input value={row.bio} onChange={(e) => updateImportRow(row.key, { bio: e.target.value })} placeholder="short description (optional)" />
                          <div className={`text-xs ${bioWithinLimit ? 'text-muted-foreground' : 'text-red-600'}`}>
                            {bioLength}/{importValidationLimits.bioMax}
                          </div>
                          {rowValidation?.fieldErrors.bio ? <div className="text-xs text-red-600">{rowValidation.fieldErrors.bio}</div> : null}
                        </div>
                        {rowValidation?.fieldErrors.preparedFile || rowValidation?.fieldErrors.emptyFile ? (
                          <div className="space-y-1">
                            {rowValidation?.fieldErrors.preparedFile ? <div className="text-xs text-red-600">{rowValidation.fieldErrors.preparedFile}</div> : null}
                            {rowValidation?.fieldErrors.emptyFile ? <div className="text-xs text-red-600">{rowValidation.fieldErrors.emptyFile}</div> : null}
                          </div>
                        ) : null}
                        {hasValidated && !hasErrors ? (
                          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">OK</div>
                        ) : null}
                        {hasErrors ? (
                          <div className="text-xs font-medium text-red-600">Contains validation errors</div>
                        ) : null}
                        {!hasValidated && importValidationProgress.running ? (
                          <div className="text-xs text-muted-foreground">Validation in progress…</div>
                        ) : null}
                        {loadingImportValidationLimits ? (
                          <div className="text-xs text-muted-foreground">Import limits are loading from API…</div>
                        ) : null}
                        <div className="text-[11px] text-muted-foreground">
                          Limits: slug ≤ {importValidationLimits.slugMax}, title ≤ {importValidationLimits.titleMax}, short description ≤ {importValidationLimits.bioMax}, image size {Math.floor(importValidationLimits.fileMinBytes / 1024)}KB–{Math.floor(importValidationLimits.fileMaxBytes / (1024 * 1024))}MB.
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>

              <div className="flex items-center justify-end">
                <Button type="button" className="cursor-pointer" disabled={!canImport} onClick={saveImportBatch}>
                  {savingImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Save & Upload
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="priorities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Category Priorities</CardTitle>
              <CardDescription>Upload or paste slug list, check category matches, then apply transactional reindexing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={priorityCategoryId || '__none__'} onValueChange={(value) => setPriorityCategoryId(value === '__none__' ? '' : value)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder={loadingCategories ? 'Loading categories...' : 'Select category'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="cursor-pointer">No category selected</SelectItem>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id} className="cursor-pointer">
                        {category.titleEn} ({category.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {priorityInputMode === 'file' ? (
                <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <input
                    id="priority-slugs-file"
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={onPickPriorityFile}
                  />
                  <Button asChild type="button" variant="outline" className="w-full cursor-pointer justify-start">
                    <label htmlFor="priority-slugs-file" className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      Choose slugs TXT file
                    </label>
                  </Button>
                  <button
                    type="button"
                    className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => setPriorityInputMode('manual')}
                  >
                    Enter slugs manually
                  </button>
                  {priorityFileName ? (
                    <div className="text-xs text-muted-foreground">Loaded: {priorityFileName}</div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <Textarea
                    value={priorityManualSlugsRaw}
                    onChange={(event) => setPriorityManualSlugsRaw(event.target.value)}
                    className="min-h-[180px]"
                    placeholder={'one-slug-per-line\nsecond-slug\nthird-slug'}
                  />
                  <button
                    type="button"
                    className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => setPriorityInputMode('file')}
                  >
                    Switch back to TXT upload
                  </button>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
                Parsed unique slugs: {parsedPrioritySlugs.length}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  className="cursor-pointer"
                  disabled={!canCheckPriorities}
                  onClick={() => void checkPrioritySlugs()}
                >
                  {checkingPriorities ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {checkingPriorities ? 'Checking...' : 'Check'}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  className="cursor-pointer"
                  disabled={!canApplyPriorities}
                  onClick={() => void applyPriorities()}
                >
                  {applyingPriorities ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {applyingPriorities ? 'Applying...' : 'Apply'}
                </Button>
              </div>

              {priorityCheckResult ? (
                <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                  <div className="text-sm font-medium">Check result</div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <button
                      type="button"
                      className="cursor-pointer underline underline-offset-2"
                      onClick={() => openPriorityModal('existing')}
                    >
                      Existing: {priorityCheckResult.existingCount}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer underline underline-offset-2"
                      onClick={() => openPriorityModal('missing')}
                    >
                      Missing: {priorityCheckResult.missingCount}
                    </button>
                  </div>
                  {priorityCheckedSignature !== priorityInputSignature ? (
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      Input changed after last check. Run Check again to unlock Apply.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Existing Characters</CardTitle>
              <CardDescription>Private characters are admin-only and hidden from public pages and character APIs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by slug, name, title"
                  className="max-w-md md:max-w-none md:flex-1"
                />
                <Select value={catalogCategoryId} onValueChange={(value) => setCatalogCategoryId(value)}>
                  <SelectTrigger className="cursor-pointer md:w-[320px]">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" className="cursor-pointer">All categories</SelectItem>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id} className="cursor-pointer">
                        {category.titleEn} ({category.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(catalogPageSize)}
                  onValueChange={(value) => {
                    const parsed = Number(value);
                    if (!Number.isFinite(parsed)) return;
                    setCatalogPageSize(parsed);
                    setCatalogPage(1);
                  }}
                >
                  <SelectTrigger className="cursor-pointer md:w-[140px]">
                    <SelectValue placeholder="Items" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATALOG_PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)} className="cursor-pointer">
                        {size} items
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 md:shrink-0">
                  <Button type="button" variant="outline" className="cursor-pointer md:shrink-0" onClick={openCreateCategory}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Category
                  </Button>
                  {catalogCategoryId !== '__all__' ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer md:shrink-0"
                      onClick={() => {
                        const current = categories.find((entry) => entry.id === catalogCategoryId);
                        if (current) openEditCategory(current);
                      }}
                    >
                      Edit Category
                    </Button>
                  ) : null}
                </div>
              </div>

              {loadingCatalog ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {catalogRows.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          className="cursor-pointer"
                          checked={allCatalogSelected ? true : (someCatalogSelected ? 'indeterminate' : false)}
                          onCheckedChange={(checked) => setAllCatalogRowsSelected(checked === true)}
                        />
                        <span>
                          Select all on page ({selectedCatalogCount}/{catalogRows.length}) - (total in category: {catalogTotal})
                        </span>
                      </label>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Button
                            type="button"
                            variant="outline"
                            className="cursor-pointer"
                            disabled={deletingSelectedCatalog || updatingSelectedCatalogVisibility || selectedCatalogCount === 0}
                            onClick={() => void setSelectedCatalogVisibility(false)}
                          >
                            Mark selected Private
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="cursor-pointer"
                            disabled={deletingSelectedCatalog || updatingSelectedCatalogVisibility || selectedCatalogCount === 0}
                            onClick={() => void setSelectedCatalogVisibility(true)}
                          >
                            Mark selected Public
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="cursor-pointer"
                            disabled={deletingSelectedCatalog || updatingSelectedCatalogVisibility || selectedCatalogCount === 0}
                            onClick={() => void deleteSelectedCatalogRows()}
                          >
                            {deletingSelectedCatalog ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            {deletingSelectedCatalog ? 'Deleting selected...' : `Delete selected (${selectedCatalogCount})`}
                          </Button>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            className="cursor-pointer"
                            checked={deleteCatalogWithFiles}
                            onCheckedChange={(checked) => setDeleteCatalogWithFiles(checked === true)}
                          />
                          Delete files too
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {catalogRows.map((row) => {
                    const pendingAction = catalogRowPending[row.id] || null;
                    const pendingVideo = pendingCatalogVideos[row.id] ?? null;
                    const rowBusy = pendingAction !== null;
                    const slugError = catalogSlugErrors[row.id] || null;
                    const slugChecking = catalogSlugChecking[row.id] === true;
                    return (
                    <div key={row.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                      <div className="mb-2 flex items-center justify-end">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            className="cursor-pointer"
                            checked={selectedCatalogKeys[row.id] === true}
                            onCheckedChange={(checked) => setCatalogRowSelected(row.id, checked === true)}
                          />
                          Select
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[112px_minmax(0,1fr)]">
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                          <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                            {row.preparedImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.preparedImageUrl} alt={row.name} className="h-24 w-full object-cover md:h-20" />
                            ) : (
                              <div className="flex h-24 items-center justify-center text-xs text-muted-foreground md:h-20">No image</div>
                            )}
                          </div>
                          <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                            {row.emptyImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.emptyImageUrl} alt={`${row.name} empty`} className="h-24 w-full object-contain p-1 md:h-20" />
                            ) : (
                              <div className="flex h-24 items-center justify-center text-xs text-muted-foreground md:h-20">No empty</div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div className="space-y-1">
                              <div className="relative">
                                <button
                                  type="button"
                                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
                                  onClick={() => void copySlugToClipboard(row.slug)}
                                  aria-label="Copy slug"
                                  title="Copy slug"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                                <Input
                                  value={row.slug}
                                  onChange={(e) => {
                                    const nextSlug = toSlug(e.target.value);
                                    setCatalogRows((prev) => prev.map((item) => item.id === row.id ? { ...item, slug: nextSlug } : item));
                                    setCatalogSlugErrors((prev) => ({ ...prev, [row.id]: null }));
                                  }}
                                  onBlur={() => void validateCatalogRowSlug(row)}
                                  placeholder="slug"
                                  className="pl-10"
                                />
                              </div>
                              {slugChecking ? <div className="text-xs text-muted-foreground">Checking slug...</div> : null}
                              {slugError ? <div className="text-xs text-red-500">{slugError}</div> : null}
                            </div>
                            <Input value={row.name} onChange={(e) => setCatalogRows((prev) => prev.map((item) => item.id === row.id ? { ...item, name: e.target.value } : item))} placeholder="name" />
                            <Input value={row.title} onChange={(e) => setCatalogRows((prev) => prev.map((item) => item.id === row.id ? { ...item, title: e.target.value } : item))} placeholder="title" />
                            <Input
                              type="number"
                              value={row.priority}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                setCatalogRows((prev) => prev.map((item) => item.id === row.id
                                  ? { ...item, priority: Number.isFinite(next) ? next : 0 }
                                  : item));
                              }}
                              placeholder="priority"
                            />
                            <Select
                              value={row.categoryId || '__missing__'}
                              onValueChange={(value) => {
                                if (value === '__missing__') return;
                                setCatalogRows((prev) => prev.map((item) => item.id === row.id ? { ...item, categoryId: value } : item));
                                setCatalogSlugErrors((prev) => ({ ...prev, [row.id]: null }));
                              }}
                            >
                              <SelectTrigger className="cursor-pointer">
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                {!row.categoryId ? (
                                  <SelectItem value="__missing__" disabled>
                                    Category required
                                  </SelectItem>
                                ) : null}
                                {categoryOptions.map((category) => (
                                  <SelectItem key={category.id} value={category.id} className="cursor-pointer">
                                    {category.titleEn} ({category.slug})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                              <Switch className="cursor-pointer" checked={row.isPublic} onCheckedChange={(checked) => {
                                setCatalogRows((prev) => prev.map((item) => item.id === row.id ? { ...item, isPublic: checked } : item));
                              }} />
                              <span>{row.isPublic ? 'Public' : 'Private'}</span>
                            </div>
                          </div>
                          <Input value={row.bio} onChange={(e) => setCatalogRows((prev) => prev.map((item) => item.id === row.id ? { ...item, bio: e.target.value } : item))} placeholder="bio" />
                          <div className="space-y-2 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                            <div className="text-xs text-muted-foreground">Preview video (optional)</div>
                            <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                              <Switch
                                className="cursor-pointer"
                                checked={row.previewVideoHasAudio}
                                onCheckedChange={(checked) => {
                                  setCatalogRows((prev) => prev.map((item) => item.id === row.id ? { ...item, previewVideoHasAudio: checked } : item));
                                }}
                                disabled={rowBusy}
                              />
                              <span>Video has audio</span>
                            </div>
                            {row.previewVideoUrl ? (
                              <div className="grid gap-2 md:grid-cols-[minmax(0,260px)_1fr] md:items-start">
                                <video
                                  src={row.previewVideoUrl}
                                  controls
                                  className="h-[120px] w-full rounded-md border border-gray-200 bg-black object-contain dark:border-gray-800"
                                />
                                <div className="flex items-center justify-between gap-2">
                                  <input
                                    id={`catalog-video-upload-${row.id}`}
                                    type="file"
                                    accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
                                    className="hidden"
                                    disabled={rowBusy}
                                    onChange={(event) => {
                                      const picked = event.target.files?.[0];
                                      if (picked) previewCatalogRowVideo(row, picked);
                                      event.currentTarget.value = '';
                                    }}
                                  />
                                  <Button asChild type="button" variant="outline" className="cursor-pointer" disabled={rowBusy}>
                                    <label htmlFor={`catalog-video-upload-${row.id}`} className="cursor-pointer">
                                      <Upload className="mr-2 h-4 w-4" />
                                      {pendingVideo ? 'Choose different video' : 'Replace video'}
                                    </label>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="cursor-pointer"
                                    disabled={rowBusy}
                                    onClick={() => void deleteCatalogRowVideo(row)}
                                  >
                                    {pendingAction === 'deleteVideo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    {pendingAction === 'deleteVideo' ? 'Deleting video...' : pendingVideo ? 'Remove pending video' : 'Delete video'}
                                  </Button>
                                </div>
                                {pendingVideo ? (
                                  <div className="text-xs text-amber-600 dark:text-amber-400">
                                    New preview selected. Click Save to upload and apply it.
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">No preview video</div>
                            )}
                            {!row.previewVideoUrl ? (
                              <div className="flex items-center gap-2">
                                <input
                                  id={`catalog-video-upload-${row.id}`}
                                  type="file"
                                  accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
                                  className="hidden"
                                  disabled={rowBusy}
                                  onChange={(event) => {
                                    const picked = event.target.files?.[0];
                                    if (picked) previewCatalogRowVideo(row, picked);
                                    event.currentTarget.value = '';
                                  }}
                                />
                                <Button asChild type="button" variant="outline" className="cursor-pointer" disabled={rowBusy}>
                                  <label htmlFor={`catalog-video-upload-${row.id}`} className="cursor-pointer">
                                    <Upload className="mr-2 h-4 w-4" />
                                    Choose video
                                  </label>
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="cursor-pointer"
                                disabled={rowBusy || !row.categoryId}
                                onClick={() => void moveCatalogRowToTop(row)}
                              >
                                {pendingAction === 'moveTop' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUp className="mr-2 h-4 w-4" />}
                                {pendingAction === 'moveTop' ? 'Raising...' : 'Up'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="cursor-pointer"
                                disabled={rowBusy || slugChecking || !!slugError || !row.categoryId}
                                onClick={() => void saveCatalogRow(row)}
                              >
                                {pendingAction === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {pendingAction === 'save' ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                className="cursor-pointer"
                                disabled={rowBusy}
                                onClick={() => void deleteCatalogRow(row.id)}
                              >
                                {pendingAction === 'delete' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                {pendingAction === 'delete' ? 'Deleting...' : 'Delete'}
                              </Button>
                            </div>
                            <label className="flex cursor-pointer items-center justify-end gap-2 text-xs text-muted-foreground">
                              <Checkbox
                                className="cursor-pointer"
                                checked={deleteCatalogWithFiles}
                                onCheckedChange={(checked) => setDeleteCatalogWithFiles(checked === true)}
                              />
                              Delete files too
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {catalogRows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No characters found.</div>
                  ) : null}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-sm dark:border-gray-800">
                <div className="text-muted-foreground">Total: {catalogTotal}</div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={catalogPage <= 1 || loadingCatalog}
                    onClick={() => {
                      const nextPage = Math.max(1, catalogPage - 1);
                      void loadCatalog({ search, categoryId: catalogCategoryId, page: nextPage });
                    }}
                  >
                    Prev
                  </Button>
                  <span className="min-w-[90px] text-center text-muted-foreground">
                    Page {catalogPage} / {catalogTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={catalogPage >= catalogTotalPages || loadingCatalog}
                    onClick={() => {
                      const nextPage = Math.min(catalogTotalPages, catalogPage + 1);
                      void loadCatalog({ search, categoryId: catalogCategoryId, page: nextPage });
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={priorityModalOpen} onOpenChange={setPriorityModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {priorityModalType === 'existing' ? 'Existing slugs in category' : 'Missing slugs in category'}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
            {priorityCheckResult ? (
              (priorityModalType === 'existing' ? priorityCheckResult.existingSlugs : priorityCheckResult.missingSlugs).length > 0 ? (
                <div className="space-y-1">
                  {(priorityModalType === 'existing' ? priorityCheckResult.existingSlugs : priorityCheckResult.missingSlugs).map((slug) => (
                    <div key={`${priorityModalType}-${slug}`} className="break-all font-mono text-xs">
                      {slug}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">No slugs in this list.</div>
              )
            ) : (
              <div className="text-muted-foreground">No data.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{categoryEditId ? 'Edit category' : 'Create category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input value={categoryDraftSlug} onChange={(e) => setCategoryDraftSlug(toSlug(e.target.value))} placeholder="category-slug" />
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={categoryDraftTitle} onChange={(e) => setCategoryDraftTitle(e.target.value)} placeholder="Category title" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="cursor-pointer" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
              <Button type="button" className="cursor-pointer" disabled={savingCategory} onClick={saveCategory}>
                {savingCategory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
