import { streamChat, chat, type ChatMessage, type AIProvider } from '../ai/provider';

export interface ChatServiceOptions {
	messages: ChatMessage[];
	courseContext?: string;
	socraticMode?: boolean;
	userId?: string;
}

export class ChatApplicationService {
	/**
	 * Stream chat tokens with live fallback support.
	 */
	public async *streamChatTokens(
		options: ChatServiceOptions
	): AsyncGenerator<{ token: string; provider: AIProvider }, void, unknown> {
		let contextToUse = options.courseContext;
		if (options.socraticMode) {
			const socraticInstruction =
				'\n[Pedagogy Instruction: Socratic Mode Active. Act as an encouraging Socratic tutor: 1) Validate the student\'s attempt. 2) Ask targeted guiding questions to help the student derive answers independently. 3) Offer hints or structured comparison points.]';
			contextToUse = contextToUse ? contextToUse + socraticInstruction : socraticInstruction;
		}

		for await (const chunk of streamChat(options.messages, contextToUse, options.userId)) {
			yield chunk;
		}
	}

	/**
	 * Standard synchronous/single-turn chat call.
	 */
	public async executeChat(options: ChatServiceOptions) {
		let contextToUse = options.courseContext;
		if (options.socraticMode) {
			const socraticInstruction =
				'\n[Pedagogy Instruction: Socratic Mode Active. Act as an encouraging Socratic tutor: 1) Validate the student\'s attempt. 2) Ask targeted guiding questions to help the student derive answers independently. 3) Offer hints or structured comparison points.]';
			contextToUse = contextToUse ? contextToUse + socraticInstruction : socraticInstruction;
		}

		return chat(options.messages, contextToUse, options.userId);
	}
}

export const chatService = new ChatApplicationService();
