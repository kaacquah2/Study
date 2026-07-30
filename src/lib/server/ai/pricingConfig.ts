/**
 * Pricing configuration for multi-provider AI cost accounting.
 * Specifies token rates in USD per 1M tokens or compute hour estimates.
 */

export interface ProviderPricing {
	promptTokenRatePerMillion: number;
	completionTokenRatePerMillion: number;
	estimatedHourlyComputeCostUSD?: number;
}

export const PROVIDER_PRICING: Record<string, ProviderPricing> = {
	gemini: {
		// Gemini Flash latest rates
		promptTokenRatePerMillion: 0.075,
		completionTokenRatePerMillion: 0.3
	},
	ollama: {
		// Local self-hosted inference
		promptTokenRatePerMillion: 0,
		completionTokenRatePerMillion: 0,
		estimatedHourlyComputeCostUSD: 0.02
	},
	ml_backend: {
		// Internal Python microservice
		promptTokenRatePerMillion: 0,
		completionTokenRatePerMillion: 0,
		estimatedHourlyComputeCostUSD: 0.01
	}
};

/**
 * Calculates estimated USD cost for a given prompt + completion token usage.
 */
export function calculateInferenceCostUSD(
	provider: 'gemini' | 'ollama' | 'ml_backend',
	promptTokens: number = 0,
	completionTokens: number = 0
): number {
	const rates = PROVIDER_PRICING[provider];
	if (!rates) return 0;

	const promptCost = (promptTokens / 1_000_000) * rates.promptTokenRatePerMillion;
	const completionCost = (completionTokens / 1_000_000) * rates.completionTokenRatePerMillion;

	return Number((promptCost + completionCost).toFixed(6));
}
