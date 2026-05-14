import groupsData from '@/data/main-page-groups.json';
import { prisma } from '@/server/db';
import {
  getCharacterMetricsMap,
  getViewerFavoriteCreatedAtMap,
  sortByFavoriteRecencyFirst,
} from '@/server/character-favorites';
import { listPublicVoices } from '@/server/voices';
import {
  sortMainPageGroups,
  type LocalizedText,
  type MainPageGroup,
  type MainPageGroupCharacter,
} from '@/components/character/main-page-groups';

type RawCharacter = MainPageGroupCharacter;
type RawGroup = MainPageGroup;
export type CatalogPreviewOverride = {
  previewVideoUrl: string | null;
  previewVideoHasAudio: boolean;
};

function asLocalizedText(value?: LocalizedText | null): LocalizedText {
  return {
    en: value?.en ?? '',
    ru: value?.ru ?? '',
  };
}

function normalizeImagePath(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim();
  if (!value) return null;
  if (value.startsWith('/')) value = value.slice(1);
  if (value.startsWith('public/')) value = value.slice('public/'.length);
  return value || null;
}

function normalizePublicImageUrl(input: string | null | undefined): string {
  if (!input) return '/characters/me-2.png';
  const value = input.trim();
  if (!value) return '/characters/me-2.png';
  return value.startsWith('/') ? value : `/${value}`;
}

export function normalizePreviewVideoUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith('//')) return value;
  if (value.startsWith('public/')) value = value.slice('public/'.length);
  if (value && !value.startsWith('/')) value = `/${value}`;
  return value.length > 0 ? value : null;
}

export function resolveCatalogPreviewVideo(input: {
  dbUrl?: string | null;
  dbHasAudio?: boolean | null;
  override?: CatalogPreviewOverride | null;
}): CatalogPreviewOverride {
  const dbPreviewVideoUrl = normalizePreviewVideoUrl(input.dbUrl);
  if (dbPreviewVideoUrl) {
    return {
      previewVideoUrl: dbPreviewVideoUrl,
      previewVideoHasAudio: input.dbHasAudio !== false,
    };
  }

  return {
    previewVideoUrl: input.override?.previewVideoUrl ?? null,
    previewVideoHasAudio: input.override?.previewVideoHasAudio ?? input.dbHasAudio !== false,
  };
}

function loadRawGroupsFromJson(): RawGroup[] {
  return sortMainPageGroups(
    ((groupsData as any)?.groups ?? []) as RawGroup[],
  );
}

function buildCatalogPreviewOverrides(groups: RawGroup[]): Map<string, CatalogPreviewOverride> {
  const overrides = new Map<string, CatalogPreviewOverride>();
  for (const group of groups) {
    for (const character of group.characters) {
      const slug = character.slug?.trim().toLowerCase();
      if (!slug || overrides.has(slug)) continue;
      overrides.set(slug, {
        previewVideoUrl: normalizePreviewVideoUrl(character.videoUrl),
        previewVideoHasAudio: character.videoHasAudio ?? true,
      });
    }
  }
  return overrides;
}

const catalogPreviewOverrides = buildCatalogPreviewOverrides(loadRawGroupsFromJson());

function pickPrimaryVariationImagePath(
  variations: Array<{ imagePath: string | null }>
): string {
  const first = variations.find((entry) => !!entry.imagePath)?.imagePath ?? null;
  return normalizePublicImageUrl(first);
}

let seedInFlight: Promise<void> | null = null;

export async function syncCharacterCatalogFromJson(options?: { force?: boolean }) {
  const force = options?.force === true;
  if (!force) {
    const categoryCount = await prisma.characterCategory.count({
      where: { isActive: true },
    });
    if (categoryCount > 0) return;
  }

  const rawGroups = loadRawGroupsFromJson();
  if (rawGroups.length === 0) return;

  const uniqueCharactersBySlug = new Map<string, RawCharacter>();
  for (const group of rawGroups) {
    for (const character of group.characters) {
      if (!character.slug) continue;
      if (!uniqueCharactersBySlug.has(character.slug)) {
        uniqueCharactersBySlug.set(character.slug, character);
      }
    }
  }

  const slugs = Array.from(uniqueCharactersBySlug.keys());
  const existingCharacters = slugs.length > 0
    ? await prisma.character.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, defaultVoiceId: true, defaultVoiceProvider: true },
    })
    : [];
  const existingBySlug = new Map(
    existingCharacters
      .filter((entry) => !!entry.slug)
      .map((entry) => [entry.slug as string, entry]),
  );

  const publicVoices = (await listPublicVoices())
    .filter((voice) => typeof voice.externalId === 'string' && voice.externalId.trim().length > 0);

  await prisma.$transaction(async (tx) => {
    const characterIdBySlug = new Map<string, string>();
    let characterIndex = 0;

    for (const [slug, entry] of uniqueCharactersBySlug) {
      const suggestedVoice = publicVoices.length > 0
        ? publicVoices[characterIndex % publicVoices.length]
        : null;
      characterIndex += 1;

      const existing = existingBySlug.get(slug) ?? null;
      const mergedDefaultVoiceId = existing?.defaultVoiceId ?? suggestedVoice?.externalId ?? null;
      const mergedDefaultVoiceProvider = existing?.defaultVoiceProvider ?? suggestedVoice?.voiceProvider ?? null;

      const character = await tx.character.upsert({
        where: { slug },
        create: {
          slug,
          title: entry.name,
          description: entry.bio ?? null,
          name: entry.name,
          tagline: null,
          bio: entry.bio ?? null,
          searchTextEn: entry.hiddenSearchText?.en ?? null,
          searchTextRu: entry.hiddenSearchText?.ru ?? null,
          priority: typeof entry.weight === 'number' ? entry.weight : 0,
          previewVideoUrl: normalizePreviewVideoUrl(entry.videoUrl),
          previewVideoHasAudio: entry.videoHasAudio ?? true,
          isCatalogPublic: true,
          defaultVoiceId: mergedDefaultVoiceId,
          defaultVoiceProvider: mergedDefaultVoiceProvider,
        },
        update: {
          title: entry.name,
          description: entry.bio ?? null,
          name: entry.name,
          bio: entry.bio ?? null,
          searchTextEn: entry.hiddenSearchText?.en ?? null,
          searchTextRu: entry.hiddenSearchText?.ru ?? null,
          priority: typeof entry.weight === 'number' ? entry.weight : 0,
          previewVideoUrl: normalizePreviewVideoUrl(entry.videoUrl),
          previewVideoHasAudio: entry.videoHasAudio ?? true,
          isCatalogPublic: true,
          defaultVoiceId: mergedDefaultVoiceId,
          defaultVoiceProvider: mergedDefaultVoiceProvider,
        },
        select: { id: true },
      });
      characterIdBySlug.set(slug, character.id);

      const primaryVariation = await tx.characterVariation.findFirst({
        where: { characterId: character.id },
        orderBy: [{ priority: 'desc' }, { id: 'asc' }],
        select: { id: true },
      });
      const imagePath = normalizeImagePath(entry.imageUrl);
      const variationPayload = {
        title: entry.name,
        description: entry.bio ?? null,
        prompt: null,
        imagePath,
        priority: typeof entry.weight === 'number' ? entry.weight : 0,
      };

      if (primaryVariation) {
        await tx.characterVariation.update({
          where: { id: primaryVariation.id },
          data: variationPayload,
        });
      } else {
        await tx.characterVariation.create({
          data: {
            characterId: character.id,
            ...variationPayload,
          },
        });
      }
    }

    for (const group of rawGroups) {
      const category = await tx.characterCategory.upsert({
        where: { slug: group.id },
        create: {
          slug: group.id,
          titleEn: group.title.en,
          titleRu: group.title.ru,
          subtitleEn: group.subtitle.en,
          subtitleRu: group.subtitle.ru,
          descriptionEn: group.description.en,
          descriptionRu: group.description.ru,
          searchTextEn: group.hiddenSearchText.en,
          searchTextRu: group.hiddenSearchText.ru,
          priority: typeof group.weight === 'number' ? group.weight : 0,
          isActive: true,
        },
        update: {
          titleEn: group.title.en,
          titleRu: group.title.ru,
          subtitleEn: group.subtitle.en,
          subtitleRu: group.subtitle.ru,
          descriptionEn: group.description.en,
          descriptionRu: group.description.ru,
          searchTextEn: group.hiddenSearchText.en,
          searchTextRu: group.hiddenSearchText.ru,
          priority: typeof group.weight === 'number' ? group.weight : 0,
          isActive: true,
        },
        select: { id: true },
      });

      await tx.characterCategoryCharacter.deleteMany({
        where: { categoryId: category.id },
      });

      const links = group.characters
        .map((character) => {
          const characterId = characterIdBySlug.get(character.slug);
          if (!characterId) return null;
          return {
            categoryId: category.id,
            characterId,
            priority: typeof character.weight === 'number' ? character.weight : 0,
          };
        })
        .filter((entry): entry is { categoryId: string; characterId: string; priority: number } => !!entry);

      if (links.length > 0) {
        await tx.characterCategoryCharacter.createMany({ data: links });
      }
    }
  });
}

async function ensureCatalogSeeded() {
  if (!seedInFlight) {
    seedInFlight = syncCharacterCatalogFromJson().finally(() => {
      seedInFlight = null;
    });
  }
  await seedInFlight;
}

export type CatalogCharacterProfile = {
  id: string;
  characterId: string;
  slug: string;
  name: string;
  tagline: string;
  bio: string;
  previewImageUrl: string;
  previewVideoUrl: string | null;
  previewVideoHasAudio: boolean;
  defaultVoiceId: string | null;
  defaultVoiceProvider: string | null;
  creationsCount: number;
  favoritesCount: number;
  isFavorited: boolean;
};

export type MobileCharacterCatalogCategory = {
  id: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  description: LocalizedText;
  hiddenSearchText: LocalizedText;
  characters: Array<{
    id: string;
    slug: string;
    name: string;
    bio: string;
    hiddenSearchText: LocalizedText;
    previewImageUrl: string;
    previewVideoUrl: string | null;
    previewVideoHasAudio: boolean;
    defaultVoiceId: string | null;
    defaultVoiceProvider: string | null;
    creationsCount: number;
    favoritesCount: number;
    isFavorited: boolean;
  }>;
};

export async function listCharacterCatalogGroups(
  viewerUserId?: string | null,
): Promise<MainPageGroup[]> {
  await ensureCatalogSeeded();

  const categories = await prisma.characterCategory.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: {
      characters: {
        where: {
          character: {
            isCatalogPublic: true,
            slug: { not: null },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          character: {
            select: {
              slug: true,
              id: true,
              name: true,
              title: true,
              bio: true,
              description: true,
              searchTextEn: true,
              searchTextRu: true,
              previewVideoUrl: true,
              previewVideoHasAudio: true,
              defaultVoiceId: true,
              defaultVoiceProvider: true,
              variations: {
                orderBy: [{ priority: 'desc' }, { id: 'asc' }],
                select: { imagePath: true },
              },
            },
          },
        },
      },
    },
  });

  const metricCharacterIds = categories.flatMap((category) => category.characters.map((entry) => entry.character.id));
  const [metrics, viewerFavoriteCreatedAtByCharacterId] = await Promise.all([
    getCharacterMetricsMap(metricCharacterIds, viewerUserId),
    getViewerFavoriteCreatedAtMap(metricCharacterIds, viewerUserId),
  ]);

  const mapped: MainPageGroup[] = categories.map((category) => {
    const characters: MainPageGroupCharacter[] = [];
    for (const entry of category.characters) {
      const character = entry.character;
      const slug = character.slug?.trim();
      if (!slug) continue;
      const previewOverride = catalogPreviewOverrides.get(slug.toLowerCase());
      const previewVideo = resolveCatalogPreviewVideo({
        dbUrl: character.previewVideoUrl,
        dbHasAudio: character.previewVideoHasAudio,
        override: previewOverride,
      });
      const itemMetrics = metrics.get(character.id);
      characters.push({
        id: character.id,
        slug,
        name: character.name?.trim() || character.title,
        bio: character.bio?.trim() || character.description?.trim() || '',
        weight: entry.priority,
        hiddenSearchText: asLocalizedText({
          en: character.searchTextEn ?? '',
          ru: character.searchTextRu ?? '',
        }),
        imageUrl: pickPrimaryVariationImagePath(character.variations),
        videoUrl: previewVideo.previewVideoUrl,
        videoHasAudio: previewVideo.previewVideoHasAudio,
        defaultVoiceId: character.defaultVoiceId ?? null,
        defaultVoiceProvider: character.defaultVoiceProvider ?? null,
        creationsCount: itemMetrics?.creationsCount ?? 0,
        favoritesCount: itemMetrics?.favoritesCount ?? 0,
        isFavorited: itemMetrics?.isFavorited ?? false,
      });
    }

    const sortedCharacters = viewerUserId
      ? sortByFavoriteRecencyFirst(characters, {
        getCharacterId: (item) => item.id,
        getPriority: (item) => Number(item.weight) || 0,
        favoriteCreatedAtByCharacterId: viewerFavoriteCreatedAtByCharacterId,
      })
      : characters;

    return {
      id: category.slug,
      title: asLocalizedText({ en: category.titleEn, ru: category.titleRu }),
      subtitle: asLocalizedText({ en: category.subtitleEn ?? '', ru: category.subtitleRu ?? '' }),
      description: asLocalizedText({ en: category.descriptionEn ?? '', ru: category.descriptionRu ?? '' }),
      weight: category.priority,
      hiddenSearchText: asLocalizedText({ en: category.searchTextEn ?? '', ru: category.searchTextRu ?? '' }),
      characters: sortedCharacters,
    };
  });

  return sortMainPageGroups(
    mapped.filter((group) => group.characters.length > 0),
    { preserveCharacterOrder: true },
  );
}

export async function listMobileCharacterCatalog(
  viewerUserId?: string | null,
): Promise<MobileCharacterCatalogCategory[]> {
  await ensureCatalogSeeded();

  const categories = await prisma.characterCategory.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: {
      characters: {
        where: {
          character: {
            isCatalogPublic: true,
            slug: { not: null },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          character: {
            select: {
              id: true,
              slug: true,
              name: true,
              title: true,
              bio: true,
              description: true,
              searchTextEn: true,
              searchTextRu: true,
              previewVideoUrl: true,
              previewVideoHasAudio: true,
              defaultVoiceId: true,
              defaultVoiceProvider: true,
              variations: {
                orderBy: [{ priority: 'desc' }, { id: 'asc' }],
                select: { imagePath: true },
              },
            },
          },
        },
      },
    },
  });

  const characterIds = categories.flatMap((category) => category.characters.map((entry) => entry.character.id));
  const [metrics, viewerFavoriteCreatedAtByCharacterId] = await Promise.all([
    getCharacterMetricsMap(characterIds, viewerUserId),
    getViewerFavoriteCreatedAtMap(characterIds, viewerUserId),
  ]);

  return categories.map((category) => {
    const mappedCharacters = category.characters.flatMap((entry) => {
      const character = entry.character;
      const slug = character.slug?.trim();
      if (!slug) return [];
      const previewOverride = catalogPreviewOverrides.get(slug.toLowerCase());
      const previewVideo = resolveCatalogPreviewVideo({
        dbUrl: character.previewVideoUrl,
        dbHasAudio: character.previewVideoHasAudio,
        override: previewOverride,
      });
      const itemMetrics = metrics.get(character.id);
      return [{
        id: character.id,
        slug,
        name: character.name?.trim() || character.title,
        bio: character.bio?.trim() || character.description?.trim() || '',
        hiddenSearchText: asLocalizedText({
          en: character.searchTextEn ?? '',
          ru: character.searchTextRu ?? '',
        }),
        previewImageUrl: pickPrimaryVariationImagePath(character.variations),
        previewVideoUrl: previewVideo.previewVideoUrl,
        previewVideoHasAudio: previewVideo.previewVideoHasAudio,
        defaultVoiceId: character.defaultVoiceId ?? null,
        defaultVoiceProvider: character.defaultVoiceProvider ?? null,
        creationsCount: itemMetrics?.creationsCount ?? 0,
        favoritesCount: itemMetrics?.favoritesCount ?? 0,
        isFavorited: itemMetrics?.isFavorited ?? false,
        priority: entry.priority,
      }];
    });

    const sortedCharacters = viewerUserId
      ? sortByFavoriteRecencyFirst(mappedCharacters, {
        getCharacterId: (item) => item.id,
        getPriority: (item) => Number(item.priority) || 0,
        favoriteCreatedAtByCharacterId: viewerFavoriteCreatedAtByCharacterId,
      })
      : mappedCharacters;

    return {
      id: category.slug,
      title: asLocalizedText({ en: category.titleEn, ru: category.titleRu }),
      subtitle: asLocalizedText({ en: category.subtitleEn ?? '', ru: category.subtitleRu ?? '' }),
      description: asLocalizedText({ en: category.descriptionEn ?? '', ru: category.descriptionRu ?? '' }),
      hiddenSearchText: asLocalizedText({ en: category.searchTextEn ?? '', ru: category.searchTextRu ?? '' }),
      characters: sortedCharacters.map(({ priority: _priority, ...character }) => character),
    };
  }).filter((group) => group.characters.length > 0);
}

export async function getCharacterCatalogProfileBySlug(
  slug: string,
  options?: { viewerUserId?: string | null },
): Promise<CatalogCharacterProfile | null> {
  await ensureCatalogSeeded();

  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const character = await prisma.character.findFirst({
    where: {
      slug: normalizedSlug,
      isCatalogPublic: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      title: true,
      tagline: true,
      description: true,
      bio: true,
      previewVideoUrl: true,
      previewVideoHasAudio: true,
      defaultVoiceId: true,
      defaultVoiceProvider: true,
      variations: {
        orderBy: [{ priority: 'desc' }, { id: 'asc' }],
        select: { imagePath: true },
      },
    },
  });
  if (!character || !character.slug) return null;

  const fallbackTagline = character.tagline?.trim()
    || character.description?.trim()
    || character.bio?.trim()
    || '';

  const metrics = await getCharacterMetricsMap([character.id], options?.viewerUserId);
  const characterMetrics = metrics.get(character.id);
  const previewVideo = resolveCatalogPreviewVideo({
    dbUrl: character.previewVideoUrl,
    dbHasAudio: character.previewVideoHasAudio,
    override: catalogPreviewOverrides.get(character.slug.toLowerCase()),
  });

  return {
    id: character.slug,
    characterId: character.id,
    slug: character.slug,
    name: character.name?.trim() || character.title,
    tagline: fallbackTagline,
    bio: character.bio?.trim() || character.description?.trim() || '',
    previewImageUrl: pickPrimaryVariationImagePath(character.variations),
    previewVideoUrl: previewVideo.previewVideoUrl,
    previewVideoHasAudio: previewVideo.previewVideoHasAudio,
    defaultVoiceId: character.defaultVoiceId ?? null,
    defaultVoiceProvider: character.defaultVoiceProvider ?? null,
    creationsCount: characterMetrics?.creationsCount ?? 0,
    favoritesCount: characterMetrics?.favoritesCount ?? 0,
    isFavorited: characterMetrics?.isFavorited ?? false,
  };
}
