/* eslint-disable */
/**
 * Tool Registry - Central management for all AI-callable tools
 *
 * This registry allows easy addition of new tools without modifying
 * the main AI orchestration logic. Just import and register new tools.
 */

import type { FunctionDeclaration } from '@google/generative-ai';
import type { RegisteredTool, ToolResult, ToolExecutionContext } from './types';
import { calendarTools } from './calendar.tools';

// Future tool imports will go here:
// import { emailTools } from './email.tools';
// import { smsTools } from './sms.tools';
// import { googleCalendarTools } from './google-calendar.tools';

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor() {
    // Register all tools
    this.registerTools(calendarTools);
    
    // Future tools:
    // this.registerTools(emailTools);
    // this.registerTools(smsTools);
    // this.registerTools(googleCalendarTools);
  }

  /**
   * Register an array of tools
   */
  private registerTools(tools: RegisteredTool[]): void {
    for (const tool of tools) {
      this.tools.set(tool.declaration.name, tool);
      console.log(`📦 Registered tool: ${tool.declaration.name}`);
    }
  }

  /**
   * Get all function declarations for Gemini's tools parameter
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    return Array.from(this.tools.values()).map(t => t.declaration);
  }

  /**
   * Get tool names for logging/debugging
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool by name
   */
  async execute(
    toolName: string,
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    
    if (!tool) {
      console.warn(`⚠️ Unknown tool requested: ${toolName}`);
      return {
        success: false,
        message: `Unknown tool: ${toolName}`,
        sideEffects: []
      };
    }

    console.log(`🔧 Executing tool: ${toolName}`, { args, context: { goalId: context.goalId } });
    
    const startTime = Date.now();
    try {
      const result = await tool.handler(args, context);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Tool ${toolName} succeeded in ${duration}ms:`, result.message);
      } else {
        console.warn(`⚠️ Tool ${toolName} failed in ${duration}ms:`, result.message);
      }
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Tool ${toolName} threw error in ${duration}ms:`, error);
      
      return {
        success: false,
        message: `Tool execution error: ${error.message}`,
        sideEffects: []
      };
    }
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }
}

// Singleton instance for the application
let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}

