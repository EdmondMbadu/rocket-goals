/* eslint-disable */
/**
 * Tool Types - Core type definitions for the AI Agent tool system
 * This provides the foundation for extensible AI actions
 */

import type { FunctionDeclaration } from '@google/generative-ai';

/**
 * Context passed to every tool execution
 */
export interface ToolExecutionContext {
  userId?: string;
  goalId?: string;
  userProfile?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

/**
 * Side effects represent changes made to the world
 * Used to notify the frontend what happened
 */
export type SideEffect =
  | { type: 'event_created'; eventId: string; title: string }
  | { type: 'event_updated'; eventId: string; title?: string }
  | { type: 'event_deleted'; eventId: string }
  | { type: 'email_sent'; to: string; subject: string }
  | { type: 'sms_sent'; to: string }
  | { type: 'reminder_scheduled'; reminderId: string; scheduledFor: string }
  | { type: 'goal_updated'; goalId: string };

/**
 * Result returned from tool execution
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
  sideEffects: SideEffect[];
}

/**
 * A registered tool with its definition and handler
 */
export interface RegisteredTool {
  /**
   * Gemini Function Declaration for this tool
   */
  declaration: FunctionDeclaration;
  
  /**
   * Handler function that executes the tool
   */
  handler: (args: Record<string, any>, context: ToolExecutionContext) => Promise<ToolResult>;
}

/**
 * Response from the AI orchestrator
 */
export interface AgentResponse {
  /** The text response from the AI */
  message: string;
  
  /** Tools that were called during this interaction */
  toolCalls: Array<{
    name: string;
    args: Record<string, any>;
    result: ToolResult;
  }>;
  
  /** Aggregate of all side effects from tool calls */
  sideEffects: SideEffect[];
}

