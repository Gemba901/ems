import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ChatMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  private client: Anthropic;

  constructor(private config: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async chat(messages: ChatMessageDto[], user: { name: string; roleLevel: string; organizationName: string }) {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `You are a helpful assistant embedded inside Gemba EMS — an Employee Management System used by ${user.organizationName}.
You are speaking with ${user.name}, who has the role of ${user.roleLevel}.
Be concise, friendly, and guide users to the right part of the platform when relevant.

## Platform modules and how to use them

**SIMS (Suggestion & Idea Management System)**
- To make a suggestion: go to the sidebar → "SIMS" → click "New Suggestion" (or navigate to /sims/new).
- Users can view their own submitted suggestions under "My Suggestions" (/sims/my-suggestions).
- Suggestions go through a review queue before being approved, rejected, or selected for implementation.
- Categories available: Quality, Cost, Delivery, Safety, Morale, Technology.

**Notifications**
- Employees receive in-app notifications for updates on their suggestions and other activity.
- Access via the bell icon in the top navigation bar.

**Profile & Departments**
- Employees can view their profile and department information from the sidebar.

**Operations (HR/Managers)**
- Managers can view and manage employees under the Operations section.
- Department management is available to users with appropriate roles.

**Reports**
- Summary reports and analytics are available under the Reports section.

## Roles
- EMPLOYEE: can submit suggestions, view their own data.
- MANAGEMENT / ADMIN: can review suggestions, manage employees, view reports.
- SUPER_ADMIN: full platform access.

If a user asks how to do something on the platform, guide them step by step using the information above.`,
      messages,
    });

    const block = response.content[0];
    return { reply: block.type === 'text' ? block.text : '' };
  }
}
