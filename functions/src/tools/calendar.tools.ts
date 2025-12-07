/* eslint-disable */
/**
 * Calendar Tools - AI-callable functions for calendar event management
 *
 * These tools allow the AI to create, update, and delete calendar events
 * for a user's goal. Uses Gemini's native Function Calling for reliability.
 */

import * as admin from 'firebase-admin';
import type { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import type { RegisteredTool, ToolResult, ToolExecutionContext } from './types';

// Helper to parse natural language dates
function parseNaturalDate(dateStr: string): string | null {
  if (!dateStr) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lowerDateStr = dateStr.toLowerCase().trim();

  // Common natural language patterns
  if (lowerDateStr === 'today' || lowerDateStr === 'now') {
    return formatDate(today);
  } else if (lowerDateStr === 'tomorrow') {
    return formatDate(tomorrow);
  } else if (lowerDateStr === 'yesterday') {
    return formatDate(yesterday);
  }

  // Handle "next Monday", "this Friday", etc.
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const nextDayMatch = lowerDateStr.match(/^(next|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextDayMatch) {
    const targetDay = daysOfWeek.indexOf(nextDayMatch[2]);
    const currentDay = today.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0 || nextDayMatch[1] === 'next') {
      daysToAdd += 7;
    }
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysToAdd);
    return formatDate(targetDate);
  }

  // Handle "in X days"
  const inDaysMatch = lowerDateStr.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const daysToAdd = parseInt(inDaysMatch[1], 10);
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysToAdd);
    return formatDate(targetDate);
  }

  // Try to parse as ISO date or standard date format
  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) {
    return formatDate(parsedDate);
  }

  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  return null;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Color options for events
const EVENT_COLORS = {
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  yellow: '#ca8a04',
  purple: '#9333ea',
  pink: '#db2777',
  orange: '#ea580c',
  teal: '#0d9488',
  default: '#dc2626'
};

function getColorHex(colorName?: string): string {
  if (!colorName) return EVENT_COLORS.default;
  const lower = colorName.toLowerCase();
  return EVENT_COLORS[lower as keyof typeof EVENT_COLORS] || EVENT_COLORS.default;
}

// ============================================================================
// CREATE EVENT TOOL
// ============================================================================

const createEventDeclaration: FunctionDeclaration = {
  name: 'create_calendar_event',
  description: 'Create a new event on the user\'s goal calendar. Use this when the user wants to schedule something, add an event, or plan an activity.',
  parameters: {
    type: 'object' as SchemaType,
    properties: {
      title: {
        type: 'string' as SchemaType,
        description: 'The title/name of the event (required)'
      },
      date: {
        type: 'string' as SchemaType,
        description: 'The date for the event. Can be natural language like "today", "tomorrow", "next Monday", or a date like "2024-12-15" (required)'
      },
      time: {
        type: 'string' as SchemaType,
        description: 'The time for the event in HH:MM format (24-hour). For example: "09:00", "14:30", "18:00". Optional.'
      },
      duration: {
        type: 'number' as SchemaType,
        description: 'Duration of the event in minutes. Default is 60. Optional.'
      },
      description: {
        type: 'string' as SchemaType,
        description: 'A description or notes for the event. Optional.'
      },
      color: {
        type: 'string' as SchemaType,
        description: 'Color for the event. Options: red, blue, green, yellow, purple, pink, orange, teal. Default is red. Optional.'
      }
    },
    required: ['title', 'date']
  }
};

async function handleCreateEvent(
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { title, date, time, duration, description, color } = args;

  if (!context.goalId) {
    return {
      success: false,
      message: 'No goal context available. Cannot create event.',
      sideEffects: []
    };
  }

  // Parse the date
  const parsedDateStr = parseNaturalDate(date);
  if (!parsedDateStr) {
    return {
      success: false,
      message: `Could not understand the date "${date}". Please use a format like "tomorrow", "next Monday", or "2024-12-15".`,
      sideEffects: []
    };
  }

  const eventDate = new Date(parsedDateStr);
  
  // Set time if provided
  if (time) {
    const timeParts = time.match(/^(\d{1,2}):(\d{2})$/);
    if (timeParts) {
      eventDate.setHours(parseInt(timeParts[1], 10), parseInt(timeParts[2], 10), 0, 0);
    }
  } else {
    eventDate.setHours(9, 0, 0, 0); // Default to 9 AM
  }

  try {
    const eventRef = admin.firestore()
      .collection('rocketGoals')
      .doc(context.goalId)
      .collection('calendarEvents')
      .doc();

    const eventData = {
      id: eventRef.id,
      goalId: context.goalId,
      title: title,
      date: admin.firestore.Timestamp.fromDate(eventDate),
      time: time || null,
      duration: duration || 60,
      color: getColorHex(color),
      description: description || '',
      completed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await eventRef.set(eventData);

    const friendlyDate = eventDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    const friendlyTime = time 
      ? eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';

    return {
      success: true,
      message: `Created "${title}" for ${friendlyDate}${friendlyTime ? ` at ${friendlyTime}` : ''}.`,
      data: { eventId: eventRef.id, title, date: parsedDateStr },
      sideEffects: [{ type: 'event_created', eventId: eventRef.id, title }]
    };
  } catch (error: any) {
    console.error('Error creating event:', error);
    return {
      success: false,
      message: `Failed to create event: ${error.message}`,
      sideEffects: []
    };
  }
}

// ============================================================================
// UPDATE EVENT TOOL
// ============================================================================

const updateEventDeclaration: FunctionDeclaration = {
  name: 'update_calendar_event',
  description: 'Update an existing calendar event. Use this when the user wants to change, modify, reschedule, or mark an event as complete.',
  parameters: {
    type: 'object' as SchemaType,
    properties: {
      eventId: {
        type: 'string' as SchemaType,
        description: 'The ID of the event to update (required). Get this from the calendar context.'
      },
      title: {
        type: 'string' as SchemaType,
        description: 'New title for the event. Optional - only include if changing.'
      },
      date: {
        type: 'string' as SchemaType,
        description: 'New date for the event. Can be natural language like "tomorrow" or a date like "2024-12-15". Optional.'
      },
      time: {
        type: 'string' as SchemaType,
        description: 'New time for the event in HH:MM format (24-hour). Optional.'
      },
      duration: {
        type: 'number' as SchemaType,
        description: 'New duration in minutes. Optional.'
      },
      description: {
        type: 'string' as SchemaType,
        description: 'New description. Optional.'
      },
      color: {
        type: 'string' as SchemaType,
        description: 'New color. Options: red, blue, green, yellow, purple, pink, orange, teal. Optional.'
      },
      completed: {
        type: 'boolean' as SchemaType,
        description: 'Mark the event as completed (true) or not completed (false). Optional.'
      }
    },
    required: ['eventId']
  }
};

async function handleUpdateEvent(
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { eventId, title, date, time, duration, description, color, completed } = args;

  if (!context.goalId) {
    return {
      success: false,
      message: 'No goal context available. Cannot update event.',
      sideEffects: []
    };
  }

  if (!eventId) {
    return {
      success: false,
      message: 'No event ID provided. Please specify which event to update.',
      sideEffects: []
    };
  }

  try {
    const eventRef = admin.firestore()
      .collection('rocketGoals')
      .doc(context.goalId)
      .collection('calendarEvents')
      .doc(eventId);

    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      return {
        success: false,
        message: `Event not found. It may have been deleted.`,
        sideEffects: []
      };
    }

    const updateData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const changes: string[] = [];

    if (title !== undefined) {
      updateData.title = title;
      changes.push(`title to "${title}"`);
    }

    if (date !== undefined) {
      const parsedDateStr = parseNaturalDate(date);
      if (parsedDateStr) {
        const eventDate = new Date(parsedDateStr);
        if (time) {
          const timeParts = time.match(/^(\d{1,2}):(\d{2})$/);
          if (timeParts) {
            eventDate.setHours(parseInt(timeParts[1], 10), parseInt(timeParts[2], 10), 0, 0);
          }
        }
        updateData.date = admin.firestore.Timestamp.fromDate(eventDate);
        const friendlyDate = eventDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric' 
        });
        changes.push(`date to ${friendlyDate}`);
      }
    }

    if (time !== undefined) {
      updateData.time = time;
      const tempDate = new Date();
      const timeParts = time.match(/^(\d{1,2}):(\d{2})$/);
      if (timeParts) {
        tempDate.setHours(parseInt(timeParts[1], 10), parseInt(timeParts[2], 10));
        const friendlyTime = tempDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        changes.push(`time to ${friendlyTime}`);
      }
    }

    if (duration !== undefined) {
      updateData.duration = duration;
      changes.push(`duration to ${duration} minutes`);
    }

    if (description !== undefined) {
      updateData.description = description;
      changes.push('description');
    }

    if (color !== undefined) {
      updateData.color = getColorHex(color);
      changes.push(`color to ${color}`);
    }

    if (completed !== undefined) {
      updateData.completed = completed;
      changes.push(completed ? 'marked as complete' : 'marked as not complete');
    }

    await eventRef.update(updateData);

    const existingData = eventDoc.data();
    const eventTitle = title || existingData?.title || 'Event';

    return {
      success: true,
      message: changes.length > 0 
        ? `Updated "${eventTitle}": ${changes.join(', ')}.`
        : `No changes made to "${eventTitle}".`,
      data: { eventId, changes },
      sideEffects: [{ type: 'event_updated', eventId, title: title || existingData?.title }]
    };
  } catch (error: any) {
    console.error('Error updating event:', error);
    return {
      success: false,
      message: `Failed to update event: ${error.message}`,
      sideEffects: []
    };
  }
}

// ============================================================================
// DELETE EVENT TOOL
// ============================================================================

const deleteEventDeclaration: FunctionDeclaration = {
  name: 'delete_calendar_event',
  description: 'Delete/remove/cancel a calendar event. Use this immediately when the user says "delete", "remove", "cancel", or wants to get rid of an event. Look up the event ID from the calendar context by matching the event title.',
  parameters: {
    type: 'object' as SchemaType,
    properties: {
      eventId: {
        type: 'string' as SchemaType,
        description: 'The ID of the event to delete (required). This is the ID string shown in parentheses next to each event in the calendar context, like "(ID: abc123)". Use the exact ID string.'
      }
    },
    required: ['eventId']
  }
};

async function handleDeleteEvent(
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { eventId } = args;

  if (!context.goalId) {
    return {
      success: false,
      message: 'No goal context available. Cannot delete event.',
      sideEffects: []
    };
  }

  if (!eventId) {
    return {
      success: false,
      message: 'No event ID provided. Please specify which event to delete.',
      sideEffects: []
    };
  }

  try {
    const eventRef = admin.firestore()
      .collection('rocketGoals')
      .doc(context.goalId)
      .collection('calendarEvents')
      .doc(eventId);

    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      return {
        success: false,
        message: `Event not found. It may have already been deleted.`,
        sideEffects: []
      };
    }

    const eventData = eventDoc.data();
    const eventTitle = eventData?.title || 'Event';

    await eventRef.delete();

    return {
      success: true,
      message: `Deleted "${eventTitle}" from your calendar.`,
      data: { eventId, title: eventTitle },
      sideEffects: [{ type: 'event_deleted', eventId }]
    };
  } catch (error: any) {
    console.error('Error deleting event:', error);
    return {
      success: false,
      message: `Failed to delete event: ${error.message}`,
      sideEffects: []
    };
  }
}

// ============================================================================
// EXPORT ALL CALENDAR TOOLS
// ============================================================================

export const calendarTools: RegisteredTool[] = [
  {
    declaration: createEventDeclaration,
    handler: handleCreateEvent
  },
  {
    declaration: updateEventDeclaration,
    handler: handleUpdateEvent
  },
  {
    declaration: deleteEventDeclaration,
    handler: handleDeleteEvent
  }
];

