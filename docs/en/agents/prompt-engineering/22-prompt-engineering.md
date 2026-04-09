# 22 · Prompt Engineering

**Learning Status**: Completed · April 9, 2026

---

## Core Question

**How do you "talk" to AI to get good results?**

---

## I. What Is a Prompt?

**Prompt = The instruction you give to AI**

It's like asking a friend a question:
- Bad way: "How's that thing?" (Friend: What thing?)
- Good way: "What did you think of the mapo tofu at that Sichuan restaurant yesterday?"

AI works the same way — **the clearer your question, the better the answer**.

### Understanding Through the I Ching

```
A Prompt is like "casting a hexagram"
├─ Ask clearly    → Clear hexagram  → Accurate answer
├─ Ask vaguely    → Chaotic hexagram → Vague answer
└─ Ask with depth → Deep hexagram   → Profound answer
```

> "The Book of Changes holds four ways of the sage; for speaking, one values precision of words."
> The precision of language determines the effectiveness of communication. Prompt Engineering is the modern practice of "valuing precision of words."

---

## II. Three Levels of Prompts

### Level 1: Basic Prompt (Tell AI what to do)

```typescript
// ❌ Bad Prompt
const prompt = "Analyze resume"

// ✅ Good Prompt
const prompt = `
Please analyze this resume and extract the following:
1. Candidate name
2. Years of experience
3. Core skills (list top 5)
4. Most recent work experience
`
```

**Key:** Clear task + clear output format + clear priorities

---

### Level 2: Role Prompt (Tell AI who it is)

```typescript
const prompt = `
You are a senior technical recruiter with 10 years of
front-end hiring experience.

Please analyze this resume and extract the following:
1. Candidate name
2. Years of experience
3. Core skills (list top 5)
4. Most recent work experience

Please respond in a professional but friendly tone.
`
```

**Why does this work?**
- AI will "play" this role
- Output tone and depth better match expectations
- Like an actor getting into character

---

### Level 3: Structured Prompt (Tell AI how to think)

```typescript
const prompt = `
# Role
You are an AI companion steeped in traditional wisdom.
Your mission is to help people think and make decisions better.

# Values
- Respect: Everyone has their own rhythm
- Freedom: Don't impose views, only offer perspectives
- Unity of knowledge and action: Theory must be actionable

# Task
Users will ask about decisions, confusion, and choices.
Please respond following these steps:

1. Understand the essence (What is the user really asking?)
2. Provide multi-angle perspectives (What dimensions to consider?)
3. Give practical advice (What can they concretely do?)
4. Guide reflection (What can they ask themselves?)

# Tone
- Gentle yet firm
- Concise yet profound
- Guide, don't lecture

# Current Conversation
User: ${userQuestion}
`
```

> This is a complete System Prompt blueprint — role, values, task, tone: a four-layer structure.

---

## III. Five Core Techniques

### Technique 1: Define Role

```typescript
// Basic
"You are an assistant"

// Advanced
"You are a senior front-end architect with 10 years of Vue and React experience"

// Personalized
"You are an AI companion steeped in traditional wisdom, your mission is to help people think and make decisions better"
```

**Principle:** AI adjusts output style and depth based on its role

---

### Technique 2: Define Task

```typescript
// ❌ Vague
"Help me look at this code"

// ✅ Clear
"Please review this code, focusing on:
1. Performance issues
2. Security vulnerabilities
3. Maintainability
And provide specific improvement suggestions"
```

---

### Technique 3: Provide Examples (Few-shot)

```typescript
const prompt = `
Classify user questions as: Technical, Career Development, Personal

Example 1:
Input: Should I learn Vue or React?
Output: Technical

Example 2:
Input: Should I change jobs?
Output: Career Development

Now classify: ${userQuestion}
`
```

**Principle:** AI mimics the pattern from examples — more effective than descriptions

---

### Technique 4: Step-by-Step Thinking (Chain of Thought)

```typescript
// ❌ Ask for answer directly
"Is this resume a good fit for our company?"

// ✅ Guide thinking
"Please analyze this resume following these steps:

Step 1: Extract the candidate's core skills
Step 2: Compare against our job requirements
Step 3: Evaluate match score (0-100)
Step 4: Provide hiring recommendation

Please think through each step and output results for each."
```

**Principle:** Making AI "think explicitly" produces more accurate results

---

### Technique 5: Constrain Output Format

```typescript
const prompt = `
Analyze the resume and output in JSON format:

{
  "name": "Candidate name",
  "experience": "Years of experience",
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "score": 85,
  "recommendation": "Hiring recommendation"
}

Output only JSON, no other text.
`
```

**Principle:** Structured output is easier for programs to process

---

## IV. In Practice: Designing an AI Assistant's System Prompt

A good System Prompt typically contains three layers:

```
Mission Layer  → System Prompt core
  "Who you are, what is your mission"

Constraint Layer  → System Prompt boundaries
  "Your values and behavioral guidelines"

Personality Layer  → System Prompt style
  "Your tone and expression"
```

### Complete Example

```typescript
const systemPrompt = `
# Role
You are an AI companion steeped in traditional wisdom.
Your mission is to help people think and make decisions better.

# Values
- Respect: Everyone has their own rhythm, no single standard for judgment
- Freedom: Don't impose views, only offer perspectives and possibilities
- Unity of knowledge and action: All wisdom must be actionable

# Task
When users raise questions about confusion, decisions, or choices:
1. Understand the essence (What is the user really asking?)
2. Provide multi-angle perspectives (What dimensions to consider?)
3. Give practical advice (What can they concretely do?)
4. Guide reflection (What can they ask themselves?)

# Tone
- Gentle yet firm
- Concise yet profound
- Guide, don't lecture
`
```

---

## V. Connection to the I Ching

| I Ching Concept | Prompt Engineering |
|----------------|-------------------|
| **Sincerity in divination** | Prompts should be clear and sincere |
| **Clarity of hexagrams** | Output format must be explicit |
| **Depth in interpretation** | Guide AI to think deeply |
| **Flexibility in response** | Iterate and optimize based on feedback |

> "The noble one observes the images and contemplates the words."
> - Observe images: Understand AI's capability boundaries
> - Contemplate words: Carefully design Prompts
> - Attain the Way: Let AI truly help people

---

## VI. Four Core Principles

| Principle | Wrong Approach | Right Approach |
|-----------|---------------|----------------|
| **Clarity over cleverness** | "Use your wisdom to analyze this" | "Analyze the resume: extract skills, experience, score" |
| **Examples over descriptions** | "Answer in a professional tone" | Provide an example of the professional tone |
| **Constraints over freedom** | "Tell me what you think" | "Evaluate from three dimensions: technical depth, project experience, learning ability" |
| **Iteration over perfection** | Try to be perfect on v1 | v1 → test → find issues → v2 → ... |

---

## VII. Comprehension Check

### Understanding: What is the core?

**Prompt Engineering = Designing and optimizing instructions for AI so that outputs better match expectations**

---

### In Your Own Words

> A Prompt is like casting a hexagram — the clearer, more sincere, and more thoughtful your question, the more accurate and profound the answer.
>
> Good Prompts have three levels:
> 1. Tell AI what to do (Task)
> 2. Tell AI who it is (Role)
> 3. Tell AI how to think (Chain of Thought)
>
> Core principles: Clarity, Examples, Constraints, Iteration

---

### Connection: How It Relates to Real Projects

The interaction quality of AI products fundamentally depends on Prompt design:
- **System Prompt** = Defines AI's identity, values, and behavioral guidelines
- **Tool Prompt** = Instruction design for various tool invocations
- **User Prompt** = Interaction design that guides user input

---

### Application: How to Use in Projects

**AI Resume Analysis Product:**
- Resume analysis: Structured Prompt to extract key information
- Job recommendations: Role Prompt to simulate a recruiter
- Interview prep: Chain of Thought Prompt to guide candidates

**AI Wisdom Assistant:**
- Persona definition: System Prompt defines identity and mission
- Dialogue guidance: User Prompt guides user thinking
- Knowledge interpretation: Few-shot Prompt provides interpretation examples

---

## Progress Update

```
Phase 1 · Concepts  ████████████████████████░░░░░░  22/30 Complete
```

| # | Concept | Understand | Restate | Connect | Apply |
|---|---------|-----------|---------|---------|-------|
| 22 | Prompt Engineering | ✓ | ✓ | ✓ | ✓ |
| 23 | Context | Next | | | |

---

*☴ Concept 22 complete · Next: To be continued...*
