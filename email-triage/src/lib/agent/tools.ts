import type Anthropic from '@anthropic-ai/sdk';

// ─── Tool Definitions ───
// Each tool is defined with name, description, and JSON Schema input.
// Descriptions are detailed so Claude knows exactly when/how to use each one.

export const agentTools: Anthropic.Tool[] = [
  // ── Gmail Tools ──
  {
    name: 'gmail_search',
    description:
      'Search the user\'s Gmail inbox. Use when the user asks to find emails, check if they received something, or look up a message. Returns subject, from, date, and snippet for each result. Supports Gmail search syntax (from:, subject:, after:, before:, has:attachment, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Gmail search query. Examples: "from:alice@example.com", "subject:invoice after:2026/04/01", "is:unread in:inbox"',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default 10, max 25)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_read',
    description:
      'Read the full body of a specific email by its Gmail message ID. Use after gmail_search to read the full contents of a particular email the user is interested in.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message_id: {
          type: 'string',
          description: 'The Gmail message ID returned from gmail_search',
        },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'gmail_send',
    description:
      'Send an email from the user\'s Gmail account. Use when the user asks to send, reply to, or compose an email. Always confirm the recipient, subject, and body with the user before sending unless they\'ve been explicit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text (plain text)' },
        cc: { type: 'string', description: 'CC recipients (comma-separated), optional' },
        in_reply_to: {
          type: 'string',
          description: 'Message-ID header to reply to (for threading), optional',
        },
        thread_id: {
          type: 'string',
          description: 'Gmail thread ID to keep reply in same thread, optional',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_draft',
    description:
      'Create a draft email in the user\'s Gmail (does not send it). Use when the user wants to prepare an email for review before sending, or when you want to stage a reply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text (plain text)' },
        cc: { type: 'string', description: 'CC recipients (comma-separated), optional' },
        in_reply_to: { type: 'string', description: 'Message-ID to reply to, optional' },
        thread_id: { type: 'string', description: 'Gmail thread ID, optional' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_archive',
    description:
      'Archive one or more emails (remove from inbox, keep in All Mail). Use when the user asks to clean up, archive, or remove emails from their inbox.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of Gmail message IDs to archive',
        },
      },
      required: ['message_ids'],
    },
  },

  // ── Calendar Tools ──
  {
    name: 'calendar_today',
    description:
      'Get the user\'s calendar events for today or a specific date. Use when the user asks "what\'s on my calendar", "do I have meetings today", "what does my day look like", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description:
            'Date in YYYY-MM-DD format. Defaults to today if not specified.',
        },
      },
      required: [],
    },
  },
  {
    name: 'calendar_create',
    description:
      'Create a new calendar event. Use when the user wants to schedule a meeting, block time, or add an event. Supports attendees, video conferencing, and all-day events.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title/summary' },
        all_day: {
          type: 'boolean',
          description:
            'Set to true for all-day / full-day events. When true, provide start_date (and optionally end_date) instead of start_time/end_time.',
        },
        start_date: {
          type: 'string',
          description:
            'Date in YYYY-MM-DD format. Required for all-day events (all_day=true). The event spans this entire day.',
        },
        end_date: {
          type: 'string',
          description:
            'End date in YYYY-MM-DD for multi-day all-day events. The end date is EXCLUSIVE (e.g. for a single-day event on April 14, set start_date="2026-04-14" and end_date="2026-04-15"). Defaults to the day after start_date if omitted.',
        },
        start_time: {
          type: 'string',
          description:
            'Start time in ISO 8601 format with Mountain Time offset (e.g. "2026-04-10T14:00:00-06:00"). Required for timed events (all_day=false or omitted).',
        },
        end_time: {
          type: 'string',
          description:
            'End time in ISO 8601 format with Mountain Time offset. Required for timed events.',
        },
        description: { type: 'string', description: 'Event description/notes, optional' },
        location: { type: 'string', description: 'Location or meeting room, optional' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses of attendees, optional',
        },
        add_meet_link: {
          type: 'boolean',
          description: 'Whether to add a Google Meet link (default false)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'calendar_range',
    description:
      'Get calendar events across a date range (e.g. a full week). Use when the user asks "what does my week look like", "show me next week", or any multi-day calendar view. Returns events from both personal and company calendars.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (inclusive)',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'calendar_find_free_time',
    description:
      'Find free time slots on a given date by checking the user\'s calendar. Use when the user asks "when am I free", "find time for a meeting", or needs to schedule something.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description: 'Date to check in YYYY-MM-DD format (defaults to today)',
        },
        duration_minutes: {
          type: 'number',
          description: 'Minimum slot duration in minutes (default 30)',
        },
        start_hour: {
          type: 'number',
          description: 'Earliest hour to consider (default 8, 24h format)',
        },
        end_hour: {
          type: 'number',
          description: 'Latest hour to consider (default 18, 24h format)',
        },
      },
      required: [],
    },
  },
  {
    name: 'calendar_rsvp',
    description:
      'Accept or decline a calendar invitation. Use when the user says to accept or decline a meeting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: { type: 'string', description: 'Google Calendar event ID' },
        response: {
          type: 'string',
          enum: ['accepted', 'declined'],
          description: 'Whether to accept or decline',
        },
      },
      required: ['event_id', 'response'],
    },
  },

  // ── Slack Tools ──
  {
    name: 'slack_send',
    description:
      'Send a Slack message to a user (DM) or channel. Use when the user asks to message someone on Slack, post in a channel, or send a quick note to a coworker.',
    input_schema: {
      type: 'object' as const,
      properties: {
        channel_or_user: {
          type: 'string',
          description:
            'Slack channel name (e.g. "#general") or user ID/email to DM. For DMs, use the Slack user ID if known.',
        },
        message: { type: 'string', description: 'Message text (supports Slack markdown)' },
      },
      required: ['channel_or_user', 'message'],
    },
  },

  // ── Reminders / Tasks ──
  {
    name: 'reminder_create',
    description:
      'Create a personal todo or reminder. Use when the user says "remind me to...", "don\'t let me forget...", "add to my todo list", etc. Todos are stored in the database and reminders are delivered via Slack when due.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'What to remember or do' },
        description: { type: 'string', description: 'Longer description of the task, optional' },
        due_at: {
          type: 'string',
          description:
            'When the reminder should fire, in ISO 8601 format. Can be null for undated tasks.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level (default medium)',
        },
        category: {
          type: 'string',
          enum: ['work', 'personal', 'properties', 'errands', 'follow-up'],
          description: 'Category for organization (default work)',
        },
        notes: { type: 'string', description: 'Additional context or notes, optional' },
        email_thread_id: {
          type: 'string',
          description:
            'Gmail thread ID to link this todo to an email conversation. Use when creating a todo from an email context (e.g. "schedule dentist appointment" after reading an email about it).',
        },
        email_message_id: {
          type: 'string',
          description: 'Gmail message ID of the specific email that triggered this todo.',
        },
        email_subject: {
          type: 'string',
          description: 'Subject line of the linked email, for quick reference.',
        },
        email_from: {
          type: 'string',
          description: 'Sender email address of the linked email.',
        },
        email_status: {
          type: 'string',
          enum: ['awaiting_reply', 'draft_ready', 'scheduled', 'resolved'],
          description:
            'Current status of the email conversation. Set to "awaiting_reply" when you\'ve sent an email and are waiting for a response, "draft_ready" when a draft has been created, "scheduled" when an appointment/meeting has been scheduled, "resolved" when the email thread is complete.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'reminder_list',
    description:
      'List the user\'s active todos and reminders. Use when the user asks "what do I need to do", "show my reminders", "what\'s on my list", "show my todos", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_completed: {
          type: 'boolean',
          description: 'Include completed items (default false)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (e.g. "work", "personal"). Omit for all.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'reminder_complete',
    description:
      'Mark a todo/reminder as completed. Use when the user says they finished something or wants to check off a task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reminder_id: { type: 'string', description: 'The reminder ID to mark as complete' },
      },
      required: ['reminder_id'],
    },
  },
  {
    name: 'todo_prioritize',
    description:
      'AI-prioritize all active todos based on due dates, urgency, and context. Use when the user asks to "prioritize my list", "what should I focus on", or "sort my todos by importance". Returns updated priorities with reasoning.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ── Email-Todo Linking Tools ──
  {
    name: 'email_check_replies',
    description:
      'Check for new replies on email threads linked to active todos. Use when the user asks "any updates on my emails?", "did the dentist reply?", or to proactively check on pending email conversations. Returns threads that have new messages since the last check.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reminder_id: {
          type: 'string',
          description:
            'Optional: check a specific todo\'s linked email thread. If omitted, checks ALL todos with email_status = "awaiting_reply".',
        },
      },
      required: [],
    },
  },
  {
    name: 'email_log_action',
    description:
      'Log an action taken on an email thread linked to a todo. Use after sending an email, creating a draft, or when a reply is received — to build up the history of what\'s happened on the conversation. This creates an audit trail the agent can review later.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reminder_id: {
          type: 'string',
          description: 'The todo/reminder ID this action relates to.',
        },
        email_thread_id: {
          type: 'string',
          description: 'Gmail thread ID.',
        },
        gmail_message_id: {
          type: 'string',
          description: 'Gmail message ID of the specific message, if applicable.',
        },
        action_type: {
          type: 'string',
          enum: [
            'email_sent',
            'email_drafted',
            'reply_received',
            'follow_up_sent',
            'appointment_confirmed',
            'appointment_scheduled',
            'archived',
            'note',
          ],
          description: 'Type of action taken.',
        },
        action_summary: {
          type: 'string',
          description:
            'Human-readable summary of what happened (e.g. "Sent appointment request to Dr. Kim\'s office for week of April 27").',
        },
        update_email_status: {
          type: 'string',
          enum: ['awaiting_reply', 'replied', 'draft_ready', 'scheduled', 'resolved'],
          description:
            'Optionally update the linked todo\'s email_status at the same time.',
        },
      },
      required: ['email_thread_id', 'action_type', 'action_summary'],
    },
  },
  {
    name: 'email_get_history',
    description:
      'Get the action history for a todo\'s linked email thread. Shows all actions taken (emails sent, drafts created, replies received, etc.) in chronological order. Use to review what\'s happened on a conversation before taking next steps.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reminder_id: {
          type: 'string',
          description: 'The todo/reminder ID to get email action history for.',
        },
        email_thread_id: {
          type: 'string',
          description:
            'Alternatively, look up by Gmail thread ID directly.',
        },
      },
      required: [],
    },
  },

  // ── Recurring Todo Tools ──
  {
    name: 'recurring_todo_create',
    description:
      'Create a recurring scheduled todo that automatically generates tasks on a schedule. Use when the user says things like "remind me every month to give Finley his heartworm pill", "I need an annual vet appointment reminder", "add a recurring task for oil changes every 5000 miles / every 3 months", or any repeating responsibility. Supports daily, weekly, monthly, and yearly recurrence with optional advance notice.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'What the recurring task is (e.g. "Give Finley heartworm pill")' },
        description: { type: 'string', description: 'Longer description, optional' },
        recurrence_type: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: 'How often it recurs',
        },
        recurrence_interval: {
          type: 'number',
          description: 'Every N units. E.g. 1 = every month, 3 = every 3 months, 6 = twice a year. Default 1.',
        },
        recurrence_day_of_week: {
          type: 'number',
          description: 'For weekly: day of week (0=Sunday, 1=Monday, ..., 6=Saturday)',
        },
        recurrence_day_of_month: {
          type: 'number',
          description: 'For monthly/yearly: day of the month (1-31)',
        },
        recurrence_month: {
          type: 'number',
          description: 'For yearly: month number (1=January, 12=December)',
        },
        advance_notice_days: {
          type: 'number',
          description: 'Create the todo this many days before it is due, giving time to prepare. E.g. 30 for a month ahead. Default 0.',
        },
        next_due_at: {
          type: 'string',
          description: 'First due date in YYYY-MM-DD format. If omitted, computed from today + recurrence.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level (default medium)',
        },
        category: {
          type: 'string',
          enum: ['work', 'personal', 'properties', 'errands', 'follow-up'],
          description: 'Category (default personal)',
        },
        notes: { type: 'string', description: 'Additional notes, optional' },
      },
      required: ['title', 'recurrence_type'],
    },
  },
  {
    name: 'recurring_todo_list',
    description:
      'List the user\'s recurring scheduled todos/responsibilities. Use when the user asks "what are my recurring tasks", "show my scheduled responsibilities", "what repeating reminders do I have", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_paused: {
          type: 'boolean',
          description: 'Include paused/inactive recurring todos (default false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'recurring_todo_pause',
    description:
      'Pause or resume a recurring todo. Use when the user wants to temporarily stop a recurring task without deleting it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recurring_todo_id: { type: 'string', description: 'The recurring todo ID' },
        pause: { type: 'boolean', description: 'true to pause, false to resume' },
      },
      required: ['recurring_todo_id', 'pause'],
    },
  },

  // ── Contact Tools ──
  {
    name: 'contact_lookup',
    description:
      'Look up a personal contact (doctor, vet, dentist, vendor, etc.) by name or type. Use when the user refers to a contact by name ("Dr. Kim") or type ("my vet"), or when booking an appointment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Name or type to search for. Examples: "Dr. Kim", "vet", "dentist", "Sarah"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'contact_add',
    description:
      'Add a new personal contact. Use when the user says "add Dr. Kim as my doctor", "save this contact", or provides contact info to remember.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Contact name (e.g. "Dr. Sarah Kim")' },
        type: {
          type: 'string',
          description:
            'Contact type: doctor, vet, dentist, vendor, lawyer, accountant, contractor, or any custom type',
        },
        email: { type: 'string', description: 'Email address, optional' },
        phone: { type: 'string', description: 'Phone number, optional' },
        address: { type: 'string', description: 'Address, optional' },
        notes: {
          type: 'string',
          description:
            'Free-form notes — scheduling preferences, office hours, special instructions, etc.',
        },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'contact_update',
    description:
      'Update an existing contact\'s information (phone, email, notes, last_appointment, etc.). Use after booking an appointment to update last_appointment, or when the user provides new info about a contact.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'string', description: 'The contact ID to update' },
        email: { type: 'string', description: 'New email address' },
        phone: { type: 'string', description: 'New phone number' },
        address: { type: 'string', description: 'New address' },
        notes: { type: 'string', description: 'Updated notes' },
        last_appointment: {
          type: 'string',
          description: 'Date of last appointment in YYYY-MM-DD format',
        },
      },
      required: ['contact_id'],
    },
  },

  // ── Browser Tools ──
  {
    name: 'browser_navigate',
    description:
      'Open a URL in a headless browser. Use when the user asks you to visit a website, fill out an online form, renew a registration, book something online, or any task that requires interacting with a web page. Returns a screenshot of the page and a numbered list of interactive elements (links, buttons, inputs) you can reference in subsequent browser_click / browser_type calls.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to navigate to (e.g. "https://example.com")',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description:
      'Click an interactive element on the current page by its index number from the elements list returned by browser_navigate or a previous browser action. After clicking, returns an updated screenshot and element list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        element_index: {
          type: 'number',
          description: 'The index number of the element to click (from the elements list)',
        },
      },
      required: ['element_index'],
    },
  },
  {
    name: 'browser_type',
    description:
      'Type text into an input field or textarea on the current page. Identifies the element by its index number from the elements list. Clears the field first by default.',
    input_schema: {
      type: 'object' as const,
      properties: {
        element_index: {
          type: 'number',
          description: 'The index number of the input/textarea element to type into',
        },
        text: {
          type: 'string',
          description: 'The text to type into the field',
        },
        clear_first: {
          type: 'boolean',
          description: 'Whether to clear the field before typing (default true)',
        },
      },
      required: ['element_index', 'text'],
    },
  },
  {
    name: 'browser_select',
    description:
      'Select an option from a <select> dropdown by its element index and the option value. Use after seeing the available options in the elements list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        element_index: {
          type: 'number',
          description: 'The index number of the <select> element',
        },
        value: {
          type: 'string',
          description: 'The value attribute of the option to select',
        },
      },
      required: ['element_index', 'value'],
    },
  },
  {
    name: 'browser_scroll',
    description:
      'Scroll the current page up or down to see more content. Returns an updated screenshot and element list after scrolling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Direction to scroll',
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll (default 500)',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_close',
    description:
      'Close the browser session when you are done with web browsing. Always close when finished to free resources.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ── Utility Tools ──
  {
    name: 'get_current_time',
    description:
      'Get the current date and time in the user\'s timezone (Mountain Time). Use when you need to know the current time for scheduling, reminders, or time-sensitive responses.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'note_to_self',
    description:
      'Save a note or piece of information that the user wants to remember. Use for "save this", "write this down", "note that...", or when the user shares information they want persisted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The note content' },
        category: {
          type: 'string',
          description: 'Category for organization (e.g. "personal", "work", "ideas", "shopping")',
        },
      },
      required: ['content'],
    },
  },
];
