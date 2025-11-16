/**
 * Utility functions for text processing
 */

/**
 * Strips markdown formatting from text for text-to-speech
 * Removes: **bold**, *italic*, # headers, bullets, links, etc.
 */
export function stripMarkdownForTTS(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // Remove markdown headers (# ## ###)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // Remove bold (**text** or __text__)
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');

  // Remove italic (*text* or _text_)
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');
  cleaned = cleaned.replace(/_(.*?)_/g, '$1');

  // Remove links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // Remove bullet points and list markers
  cleaned = cleaned.replace(/^[\*\-\+]\s+/gm, '');
  cleaned = cleaned.replace(/^\d+\.\s+/gm, '');

  // Remove code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // Remove horizontal rules
  cleaned = cleaned.replace(/^---$/gm, '');

  // Clean up multiple spaces/newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  // Remove leading/trailing whitespace from each line
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

