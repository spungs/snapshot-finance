export const SUBSCRIPTION_LIMITS = {
    FREE: 30,
    PRO: 125,
    MAX: 250,
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_LIMITS;

export const canUseAutoSnapshot = (plan: SubscriptionPlan): boolean => {
    return plan === 'PRO' || plan === 'MAX';
};
