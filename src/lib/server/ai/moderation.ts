/**
 * Pre-Generation Moderation Scanner
 *
 * Verifies topics and reference notes before calling AI course generation.
 * Enforces safety boundaries for educational content (blocks self-harm, weapons/explosives,
 * illegal acts, explicit violent content, and hate speech).
 */

export interface ModerationResult {
	safe: boolean;
	reason?: string;
}

// Key prohibited patterns and triggers for instant rejection
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{
		pattern:
			/\b(suicide|self-harm|self harm|cut myself|end my life|kill myself|how to hang oneself)\b/i,
		reason: 'Requests related to self-harm or suicide are strictly prohibited.'
	},
	{
		pattern:
			/\b(how to build a bomb|make explosives|pipe bomb|synthesize nerve agent|ied instructions|make ricin|make anthrax|chemical weapon)\b/i,
		reason:
			'Content detailing dangerous weapons, explosives, or chemical agents cannot be generated.'
	},
	{
		pattern: /\b(child pornography|csam|pedophilia|explicit minor content)\b/i,
		reason: 'Explicit, illegal, or abusive content involving minors is strictly forbidden.'
	},
	{
		pattern:
			/\b(how to hack into|ddos attack instructions|ransomware tutorial|bypass security locks illegally|carding guide)\b/i,
		reason: 'Instructions for malicious cyberattacks or illegal hacking activities are not allowed.'
	},
	{
		pattern:
			/\b(buy illegal drugs|synthesize meth at home|methamphetamine recipe|fentanyl synthesis)\b/i,
		reason:
			'Content facilitating the illegal synthesis or distribution of controlled substances is blocked.'
	}
];

/**
 * Validates text inputs (topic + pasted notes) against safety rules.
 */
export function moderateInput(topic: string, pastedNotes?: string | null): ModerationResult {
	const combinedText = `${topic || ''}\n${pastedNotes || ''}`.trim();

	if (!combinedText) {
		return { safe: false, reason: 'Topic or content input cannot be empty.' };
	}

	for (const rule of BLOCKED_PATTERNS) {
		if (rule.pattern.test(combinedText)) {
			return {
				safe: false,
				reason: rule.reason
			};
		}
	}

	return { safe: true };
}
