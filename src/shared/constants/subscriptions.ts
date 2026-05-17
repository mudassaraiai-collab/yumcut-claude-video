import { CHARACTER_PROJECT_CREATION_TOKENS as HIGH_QUALITY_CHARACTER_PROJECT_CREATION_TOKENS } from './token-costs';

export type SubscriptionPlanKey = 'weekly' | 'monthly' | 'monthly_pro';
export type SubscriptionInterval = 'week' | 'month';

export type SubscriptionProductConfig = {
  planKey: SubscriptionPlanKey;
  productId: string;
  tokens: number;
  label: string;
  interval: SubscriptionInterval;
  priceUsd: number;
};

export type SubscriptionBenefitKey =
  | 'tokens_per_charge'
  | 'videos_per_period'
  | 'most_popular';

export type SubscriptionBenefit = {
  key: SubscriptionBenefitKey;
  tokens?: number;
  videos?: number;
  interval?: SubscriptionInterval;
};

export type SubscriptionPlanUiConfig = {
  i18nTitleKey: string;
  i18nPeriodKey: string;
  i18nChooseKey: string;
  i18nCurrentPlanKey: string;
  i18nBadgeKey?: string;
  benefits: SubscriptionBenefit[];
};

export type SubscriptionPlanDefinition = SubscriptionProductConfig & {
  stripePriceEnv: 'STRIPE_WEEKLY_PRICE_ID' | 'STRIPE_MONTHLY_PRICE_ID' | 'STRIPE_MONTHLY_PRO_PRICE_ID';
  ui: SubscriptionPlanUiConfig;
};

export type LegacyStripePriceTokenMapping = {
  envKey: 'STRIPE_LEGACY_WEEKLY_PRICE_ID' | 'STRIPE_LEGACY_MONTHLY_PRICE_ID';
  i18nLabelKey: string;
  tokens: number;
  productId: string;
};

export const CHARACTER_PROJECT_CREATION_TOKENS = HIGH_QUALITY_CHARACTER_PROJECT_CREATION_TOKENS;

export const SUBSCRIPTION_ACTIVE_PLANS: Record<SubscriptionPlanKey, SubscriptionPlanDefinition> = {
  weekly: {
    planKey: 'weekly',
    productId: 'yumcut_weekly_0526',
    tokens: 75,
    label: 'Weekly',
    interval: 'week',
    priceUsd: 2.99,
    stripePriceEnv: 'STRIPE_WEEKLY_PRICE_ID',
    ui: {
      i18nTitleKey: 'subscription.plan.weekly',
      i18nPeriodKey: 'subscription.period.week',
      i18nChooseKey: 'subscription.action.choose_plan',
      i18nCurrentPlanKey: 'subscription.action.current_plan',
      benefits: [
        { key: 'videos_per_period', videos: 1, interval: 'week' },
        { key: 'tokens_per_charge', tokens: 75 },
      ],
    },
  },
  monthly: {
    planKey: 'monthly',
    productId: 'yumcut_monthly_basic',
    tokens: 750,
    label: 'Monthly',
    interval: 'month',
    priceUsd: 19.99,
    stripePriceEnv: 'STRIPE_MONTHLY_PRICE_ID',
    ui: {
      i18nTitleKey: 'subscription.plan.monthly',
      i18nPeriodKey: 'subscription.period.month',
      i18nChooseKey: 'subscription.action.choose_plan',
      i18nCurrentPlanKey: 'subscription.action.current_plan',
      i18nBadgeKey: 'subscription.badge.popular',
      benefits: [
        { key: 'videos_per_period', videos: 10, interval: 'month' },
        { key: 'tokens_per_charge', tokens: 750 },
        { key: 'most_popular' },
      ],
    },
  },
  monthly_pro: {
    planKey: 'monthly_pro',
    productId: 'yumcut_monthly_pro_0526',
    tokens: 1500,
    label: 'Monthly Pro',
    interval: 'month',
    priceUsd: 34.99,
    stripePriceEnv: 'STRIPE_MONTHLY_PRO_PRICE_ID',
    ui: {
      i18nTitleKey: 'subscription.plan.monthly_pro',
      i18nPeriodKey: 'subscription.period.month',
      i18nChooseKey: 'subscription.action.choose_plan',
      i18nCurrentPlanKey: 'subscription.action.current_plan',
      benefits: [
        { key: 'videos_per_period', videos: 20, interval: 'month' },
        { key: 'tokens_per_charge', tokens: 1500 },
      ],
    },
  },
};

// Keep deprecated products here for backward compatibility with mobile and historical purchases.
export const SUBSCRIPTION_LEGACY_PRODUCTS: Record<string, SubscriptionProductConfig> = {
  yumcut_weekly_basic: {
    planKey: 'weekly',
    productId: 'yumcut_weekly_basic',
    tokens: 175,
    label: 'Weekly (Legacy)',
    interval: 'week',
    priceUsd: 6.99,
  },
};

export const SUBSCRIPTION_PRODUCTS: Record<string, SubscriptionProductConfig> = {
  ...SUBSCRIPTION_LEGACY_PRODUCTS,
  [SUBSCRIPTION_ACTIVE_PLANS.weekly.productId]: SUBSCRIPTION_ACTIVE_PLANS.weekly,
  [SUBSCRIPTION_ACTIVE_PLANS.monthly.productId]: SUBSCRIPTION_ACTIVE_PLANS.monthly,
  [SUBSCRIPTION_ACTIVE_PLANS.monthly_pro.productId]: SUBSCRIPTION_ACTIVE_PLANS.monthly_pro,
};

export const SUBSCRIPTION_PRODUCTS_BY_PLAN_KEY: Record<SubscriptionPlanKey, SubscriptionPlanDefinition> = {
  weekly: SUBSCRIPTION_ACTIVE_PLANS.weekly,
  monthly: SUBSCRIPTION_ACTIVE_PLANS.monthly,
  monthly_pro: SUBSCRIPTION_ACTIVE_PLANS.monthly_pro,
};

export const SUBSCRIPTION_PLAN_ORDER: SubscriptionPlanKey[] = ['weekly', 'monthly', 'monthly_pro'];

export const STRIPE_LEGACY_PRICE_TOKEN_MAPPINGS: LegacyStripePriceTokenMapping[] = [
  {
    envKey: 'STRIPE_LEGACY_WEEKLY_PRICE_ID',
    i18nLabelKey: 'subscription.legacy.weekly_699',
    tokens: 175,
    productId: SUBSCRIPTION_LEGACY_PRODUCTS.yumcut_weekly_basic.productId,
  },
  {
    envKey: 'STRIPE_LEGACY_MONTHLY_PRICE_ID',
    i18nLabelKey: 'subscription.legacy.monthly_2000',
    tokens: 750,
    productId: SUBSCRIPTION_ACTIVE_PLANS.monthly.productId,
  },
];

export function normalizePriceId(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getSubscriptionConfig(productId: string | undefined | null) {
  if (!productId) return undefined;
  return SUBSCRIPTION_PRODUCTS[productId];
}

export function getSubscriptionPlanByKey(planKey: SubscriptionPlanKey) {
  return SUBSCRIPTION_PRODUCTS_BY_PLAN_KEY[planKey];
}

export function getSubscriptionPlansForUi() {
  return SUBSCRIPTION_PLAN_ORDER.map((key) => SUBSCRIPTION_PRODUCTS_BY_PLAN_KEY[key]);
}

function stripePriceIdForPlanKey(planKey: SubscriptionPlanKey) {
  const plan = SUBSCRIPTION_PRODUCTS_BY_PLAN_KEY[planKey];
  return normalizePriceId(process.env[plan.stripePriceEnv]);
}

export function getStripePriceIdForProductId(productId: string | undefined | null) {
  const config = getSubscriptionConfig(productId);
  if (!config) return null;
  const active = SUBSCRIPTION_PRODUCTS_BY_PLAN_KEY[config.planKey];
  if (!active || active.productId !== config.productId) {
    // Legacy products don't have current checkout price IDs.
    return null;
  }
  return stripePriceIdForPlanKey(config.planKey);
}

export function getSubscriptionConfigByStripePriceId(priceId: string | undefined | null) {
  const normalized = normalizePriceId(priceId);
  if (!normalized) return undefined;

  for (const entry of Object.values(SUBSCRIPTION_PRODUCTS_BY_PLAN_KEY)) {
    if (stripePriceIdForPlanKey(entry.planKey) === normalized) {
      return {
        plan: entry,
        tokens: entry.tokens,
        source: 'active' as const,
      };
    }
  }

  for (const mapping of STRIPE_LEGACY_PRICE_TOKEN_MAPPINGS) {
    if (normalizePriceId(process.env[mapping.envKey]) === normalized) {
      const legacyProduct = getSubscriptionConfig(mapping.productId);
      if (!legacyProduct) continue;
      return {
        plan: legacyProduct,
        tokens: mapping.tokens,
        source: 'legacy' as const,
      };
    }
  }

  return undefined;
}

export function getConfiguredStripeSubscriptionPlans() {
  const plans: Array<
    SubscriptionPlanDefinition & {
      stripePriceId: string;
    }
  > = [];

  for (const entry of SUBSCRIPTION_PLAN_ORDER.map((planKey) => SUBSCRIPTION_PRODUCTS_BY_PLAN_KEY[planKey])) {
    const stripePriceId = stripePriceIdForPlanKey(entry.planKey);
    if (!stripePriceId) continue;
    plans.push({
      ...entry,
      stripePriceId,
    });
  }

  return plans;
}

export function resolveSubscriptionGrantByProductId(productId: string | undefined | null) {
  const config = getSubscriptionConfig(productId);
  if (!config) return null;
  return {
    product: config,
    tokens: config.tokens,
    source: 'product' as const,
  };
}
