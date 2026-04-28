# Product Brief

## Problem

Support teams receive repetitive driver operations tickets that require checking SOPs, updating trackers, and responding with standardized messages.

Manual handling creates delays, inconsistent responses, and avoidable operational effort.

## Target Users

- Support agents
- Operations teams
- Driver experience teams

## Proposed Solution

An AI-assisted Slack workflow that classifies support tickets, retrieves the relevant SOP, determines the required Google Sheets action, executes the action, and replies using approved templates.

## Core User Journey

1. Agent posts a ticket in Slack.
2. AI classifies the issue.
3. Relevant SOP context is retrieved.
4. AI decides the required sheet operation.
5. Google Sheet is updated.
6. Slack response is sent automatically.

## MVP Scope

Included:

- Slack ticket ingestion
- Keyword-based classification
- SOP retrieval
- Google Sheets CRUD operations
- Template-based Slack responses

Not included yet:

- Human approval buttons
- Semantic vector search
- Production audit dashboard
- Role-based access controls

## Success Metrics

- Reduction in average handling time
- Increase in first-contact resolution
- Reduction in manual sheet updates
- Classification accuracy
- Escalation rate
- Manual correction rate