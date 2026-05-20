/**
 * Document templates — Pre-built content for common document types.
 *
 * Each template has:
 * - id: Unique identifier
 * - title: Display name
 * - description: Short description
 * - icon: Emoji icon
 * - category: Grouping category
 * - content: Tiptap-compatible HTML content
 */

export interface DocumentTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'business' | 'personal' | 'education' | 'creative';
  content: string;
}

export const templates: DocumentTemplate[] = [
  // ── Business ────────────────────────────────────────
  {
    id: 'meeting-notes',
    title: 'Meeting Notes',
    description: 'Structured template for capturing meeting discussions and action items',
    icon: '📋',
    category: 'business',
    content: `<h1>Meeting Notes</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()} &nbsp;|&nbsp; <strong>Time:</strong> ${new Date().toLocaleTimeString()} &nbsp;|&nbsp; <strong>Duration:</strong> 30 min</p>
<h2>Attendees</h2>
<ul>
<li>Attendee 1 (Role)</li>
<li>Attendee 2 (Role)</li>
<li>Attendee 3 (Role)</li>
</ul>
<h2>Agenda</h2>
<ol>
<li>Topic 1</li>
<li>Topic 2</li>
<li>Topic 3</li>
</ol>
<h2>Discussion</h2>
<h3>Topic 1</h3>
<p>Key points discussed...</p>
<h3>Topic 2</h3>
<p>Key points discussed...</p>
<h2>Action Items</h2>
<ul>
<li>☐ <strong>Owner:</strong> Action item description — <em>Due: [date]</em></li>
<li>☐ <strong>Owner:</strong> Action item description — <em>Due: [date]</em></li>
<li>☐ <strong>Owner:</strong> Action item description — <em>Due: [date]</em></li>
</ul>
<h2>Next Meeting</h2>
<p><strong>Date:</strong> [date] &nbsp;|&nbsp; <strong>Topic:</strong> [topic]</p>`,
  },
  {
    id: 'project-proposal',
    title: 'Project Proposal',
    description: 'Comprehensive project proposal with objectives, timeline, and budget',
    icon: '🚀',
    category: 'business',
    content: `<h1>Project Proposal: [Project Name]</h1>
<p><strong>Prepared by:</strong> [Name] &nbsp;|&nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()} &nbsp;|&nbsp; <strong>Version:</strong> 1.0</p>
<h2>Executive Summary</h2>
<p>Brief overview of the project, its goals, and expected outcomes. This should be 2-3 paragraphs maximum.</p>
<h2>Problem Statement</h2>
<p>Describe the problem or opportunity that this project addresses.</p>
<h2>Objectives</h2>
<ol>
<li>Objective 1</li>
<li>Objective 2</li>
<li>Objective 3</li>
</ol>
<h2>Proposed Solution</h2>
<p>Describe the approach and methodology.</p>
<h3>Technical Approach</h3>
<p>Technical details of the implementation.</p>
<h3>Alternatives Considered</h3>
<ul>
<li><strong>Option A:</strong> Description</li>
<li><strong>Option B:</strong> Description</li>
</ul>
<h2>Timeline</h2>
<ul>
<li><strong>Phase 1 — Planning:</strong> [start] to [end]</li>
<li><strong>Phase 2 — Development:</strong> [start] to [end]</li>
<li><strong>Phase 3 — Testing:</strong> [start] to [end]</li>
<li><strong>Phase 4 — Launch:</strong> [start] to [end]</li>
</ul>
<h2>Budget</h2>
<ul>
<li>Development: $XX,XXX</li>
<li>Infrastructure: $X,XXX</li>
<li>Miscellaneous: $X,XXX</li>
</ul>
<p><strong>Total:</strong> $XX,XXX</p>
<h2>Success Metrics</h2>
<ul>
<li>Metric 1: Target value</li>
<li>Metric 2: Target value</li>
</ul>
<h2>Risks & Mitigation</h2>
<ul>
<li><strong>Risk:</strong> Description — <em>Mitigation:</em> Strategy</li>
</ul>`,
  },
  {
    id: 'weekly-status',
    title: 'Weekly Status Report',
    description: 'Track progress, blockers, and plans for the week',
    icon: '📊',
    category: 'business',
    content: `<h1>Weekly Status Report — Week of [Date]</h1>
<h2>👤 Team Member: [Name]</h2>
<h3>✅ Completed This Week</h3>
<ul>
<li>Completed task 1</li>
<li>Completed task 2</li>
<li>Completed task 3</li>
</ul>
<h3>🔄 In Progress</h3>
<ul>
<li>Ongoing task 1 — <em>% complete</em></li>
<li>Ongoing task 2 — <em>% complete</em></li>
</ul>
<h3>🚧 Blockers</h3>
<ul>
<li>Blocker 1 — <em>Needs: [action]</em></li>
</ul>
<h3>📅 Next Week's Plan</h3>
<ul>
<li>Planned task 1</li>
<li>Planned task 2</li>
</ul>
<h3>📈 Key Metrics</h3>
<ul>
<li>Metric 1: Value (↑/↓/→ from last week)</li>
<li>Metric 2: Value (↑/↓/→ from last week)</li>
</ul>`,
  },

  // ── Personal ────────────────────────────────────────
  {
    id: 'resume',
    title: 'Resume / CV',
    description: 'Clean, professional resume template',
    icon: '📄',
    category: 'personal',
    content: `<h1>[Your Full Name]</h1>
<p>[City, State] | [email@example.com] | [phone number] | [LinkedIn/GitHub URL]</p>
<h2>Professional Summary</h2>
<p>2-3 sentences summarizing your experience, key skills, and career goals. Focus on what you bring to the table.</p>
<h2>Experience</h2>
<h3>Job Title — Company Name</h3>
<p><em>[Start Date] – [End Date or "Present"]</em></p>
<ul>
<li>Achievement or responsibility with measurable impact</li>
<li>Another achievement with quantified results</li>
<li>Leadership or initiative demonstrated</li>
</ul>
<h3>Previous Job Title — Previous Company</h3>
<p><em>[Start Date] – [End Date]</em></p>
<ul>
<li>Key accomplishment</li>
<li>Another accomplishment</li>
</ul>
<h2>Education</h2>
<h3>Degree — University Name</h3>
<p><em>[Graduation Year]</em></p>
<ul>
<li>Relevant coursework, honors, or GPA (if notable)</li>
</ul>
<h2>Skills</h2>
<ul>
<li><strong>Technical:</strong> Skill 1, Skill 2, Skill 3</li>
<li><strong>Tools:</strong> Tool 1, Tool 2, Tool 3</li>
<li><strong>Soft Skills:</strong> Skill 1, Skill 2, Skill 3</li>
</ul>
<h2>Projects</h2>
<h3>Project Name</h3>
<p>Brief description of the project, technologies used, and your role. Include links if available.</p>`,
  },
  {
    id: 'brainstorm',
    title: 'Brainstorm / Ideas',
    description: 'Free-form idea capture with structure for follow-up',
    icon: '💡',
    category: 'personal',
    content: `<h1>Brainstorm: [Topic]</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()} &nbsp;|&nbsp; <strong>Participants:</strong> [names]</p>
<h2>Problem / Opportunity</h2>
<p>What are we trying to solve or explore?</p>
<h2>Ideas</h2>
<h3>💡 Idea 1: [Title]</h3>
<ul>
<li>Description of the idea</li>
<li>Pros: ...</li>
<li>Cons: ...</li>
</ul>
<h3>💡 Idea 2: [Title]</h3>
<ul>
<li>Description of the idea</li>
<li>Pros: ...</li>
<li>Cons: ...</li>
</ul>
<h3>💡 Idea 3: [Title]</h3>
<ul>
<li>Description of the idea</li>
<li>Pros: ...</li>
<li>Cons: ...</li>
</ul>
<h2>Top Picks</h2>
<ol>
<li>Idea X — because...</li>
<li>Idea Y — because...</li>
</ol>
<h2>Next Steps</h2>
<ul>
<li>☐ Action item 1</li>
<li>☐ Action item 2</li>
</ul>`,
  },

  // ── Education ────────────────────────────────────────
  {
    id: 'lecture-notes',
    title: 'Lecture Notes',
    description: 'Structured template for class lectures and study sessions',
    icon: '🎓',
    category: 'education',
    content: `<h1>Lecture Notes: [Course Name]</h1>
<p><strong>Topic:</strong> [Lecture Topic] &nbsp;|&nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()} &nbsp;|&nbsp; <strong>Lecturer:</strong> [Name]</p>
<h2>Key Concepts</h2>
<ul>
<li>Concept 1: Brief definition</li>
<li>Concept 2: Brief definition</li>
<li>Concept 3: Brief definition</li>
</ul>
<h2>Detailed Notes</h2>
<h3>Section 1</h3>
<p>Main points from this section of the lecture...</p>
<h3>Section 2</h3>
<p>Main points from this section...</p>
<h2>Formulas / Code</h2>
<pre>Formula or code snippet here</pre>
<h2>Examples</h2>
<ol>
<li>Example 1 with solution</li>
<li>Example 2 with solution</li>
</ol>
<h2>Questions to Follow Up</h2>
<ul>
<li>❓ Question 1</li>
<li>❓ Question 2</li>
</ul>
<h2>Summary</h2>
<p>Key takeaways in 2-3 sentences...</p>`,
  },
  {
    id: 'research-paper',
    title: 'Research Paper Outline',
    description: 'Academic research paper structure with sections',
    icon: '🔬',
    category: 'education',
    content: `<h1>[Paper Title]</h1>
<p><strong>Authors:</strong> [Name 1], [Name 2] &nbsp;|&nbsp; <strong>Institution:</strong> [University/Org] &nbsp;|&nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<h2>Abstract</h2>
<p>Brief summary of the research question, methodology, key findings, and implications (150-250 words).</p>
<h2>1. Introduction</h2>
<p>Background and context for the research. State the problem and its significance.</p>
<h3>1.1 Research Question</h3>
<p>Clearly state the primary research question.</p>
<h3>1.2 Hypothesis</h3>
<p>State the hypothesis being tested.</p>
<h2>2. Literature Review</h2>
<p>Review of existing research and how this study builds upon or differs from previous work.</p>
<h2>3. Methodology</h2>
<h3>3.1 Research Design</h3>
<p>Describe the overall approach.</p>
<h3>3.2 Data Collection</h3>
<p>Describe data sources and collection methods.</p>
<h3>3.3 Analysis</h3>
<p>Describe analytical methods.</p>
<h2>4. Results</h2>
<p>Present findings without interpretation.</p>
<h2>5. Discussion</h2>
<p>Interpret results, discuss implications, acknowledge limitations.</p>
<h2>6. Conclusion</h2>
<p>Summarize key findings and suggest future research directions.</p>
<h2>References</h2>
<ul>
<li>Author (Year). Title. Journal. DOI/URL</li>
</ul>`,
  },

  // ── Creative ────────────────────────────────────────
  {
    id: 'blog-post',
    title: 'Blog Post',
    description: 'Structured blog post with intro, body, and conclusion',
    icon: '✍️',
    category: 'creative',
    content: `<h1>[Blog Post Title]</h1>
<p><em>By [Author] · ${new Date().toLocaleDateString()} · [X] min read</em></p>
<h2>Introduction</h2>
<p>Hook the reader with a compelling opening. State the problem or topic in a way that makes them want to keep reading. End with a thesis or preview of what's coming.</p>
<h2>[Section 1 Heading]</h2>
<p>First main point. Include data, examples, or stories to support your argument.</p>
<h2>[Section 2 Heading]</h2>
<p>Second main point. Build on the previous section.</p>
<h2>[Section 3 Heading]</h2>
<p>Third main point. Add practical advice or actionable takeaways.</p>
<h2>Key Takeaways</h2>
<ul>
<li>Takeaway 1</li>
<li>Takeaway 2</li>
<li>Takeaway 3</li>
</ul>
<h2>Conclusion</h2>
<p>Wrap up with a strong closing. Restate the main message and end with a call-to-action or thought-provoking question.</p>
<hr>
<p><em>Thanks for reading! If you enjoyed this, share it with someone who'd find it useful.</em></p>`,
  },
  {
    id: 'content-calendar',
    title: 'Content Calendar',
    description: 'Plan and track content across channels',
    icon: '📅',
    category: 'creative',
    content: `<h1>Content Calendar — [Month/Year]</h1>
<h2>Overview</h2>
<p><strong>Theme:</strong> [Monthly theme] &nbsp;|&nbsp; <strong>Goal:</strong> [Primary goal]</p>
<h2>Week 1: [Theme]</h2>
<ul>
<li><strong>Monday:</strong> Blog post — [Title]</li>
<li><strong>Tuesday:</strong> Social — [Platform] [Topic]</li>
<li><strong>Wednesday:</strong> Email — [Subject]</li>
<li><strong>Thursday:</strong> Social — [Platform] [Topic]</li>
<li><strong>Friday:</strong> Video/Podcast — [Title]</li>
</ul>
<h2>Week 2: [Theme]</h2>
<ul>
<li><strong>Monday:</strong> Blog post — [Title]</li>
<li><strong>Tuesday:</strong> Social — [Platform] [Topic]</li>
<li><strong>Wednesday:</strong> Email — [Subject]</li>
<li><strong>Thursday:</strong> Social — [Platform] [Topic]</li>
<li><strong>Friday:</strong> Video/Podcast — [Title]</li>
</ul>
<h2>Week 3: [Theme]</h2>
<ul>
<li><strong>Monday:</strong> Blog post — [Title]</li>
<li><strong>Tuesday:</strong> Social — [Platform] [Topic]</li>
</ul>
<h2>Week 4: [Theme]</h2>
<ul>
<li><strong>Monday:</strong> Blog post — [Title]</li>
<li><strong>Tuesday:</strong> Social — [Platform] [Topic]</li>
</ul>
<h2>Content Ideas Queue</h2>
<ul>
<li>Idea 1</li>
<li>Idea 2</li>
<li>Idea 3</li>
</ul>`,
  },
];

/** Get a template by ID */
export function getTemplate(id: string): DocumentTemplate | undefined {
  return templates.find(t => t.id === id);
}

/** Get templates grouped by category */
export function getTemplatesByCategory(): Record<string, DocumentTemplate[]> {
  const grouped: Record<string, DocumentTemplate[]> = {};
  for (const t of templates) {
    (grouped[t.category] ??= []).push(t);
  }
  return grouped;
}

/** Apply dynamic date substitutions */
export function processTemplateContent(content: string): string {
  const now = new Date();
  return content
    .replace(/\$\{new Date\(\)\.toLocaleDateString\(\)\}/g, now.toLocaleDateString())
    .replace(/\$\{new Date\(\)\.toLocaleTimeString\(\)\}/g, now.toLocaleTimeString());
}
