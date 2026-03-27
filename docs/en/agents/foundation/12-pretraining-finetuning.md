# 12 · Pre-training & Fine-tuning · The Way of Root and Branch Growth

**Study Date**: 2026.03.15
**Learning Method**: Socratic dialogue deduction

---

## I. Starting Point: An Analogy

You spent 20 years reading, experiencing, and thinking, forming your current cognitive foundation.
Now someone wants you to become a lawyer,
would they ask you to completely erase those 20 years and start learning law from scratch?
Or — specifically supplement legal knowledge on top of your existing cognitive foundation?

### My Deduction
#### Option 1: Start from Scratch (Train from Scratch)
- ● Cost: You are no longer yourself, losing 20 years of accumulated thinking and experience
- ● Extremely high time and economic cost
- ● Benefit: You become a "high-concentration lawyer", completely born for law
- ● But essentially — just a talking legal dictionary, not a truly thinking lawyer

#### Option 2: Deepen on the Existing Foundation (Fine-tuning)
- ● Benefit: Fast to get started, 20 years of experience can be reused
- ● Cost: There will be noise, talking about law might digress to front-end development or Yijing
- ● May seem "half-baked", with unstable roots
- ● But — this is the real way intellectual growth happens

### Key Insight
Learning itself is a kind of deepening or supplementation based on current cognition.
Just like when I learn AI, I can't throw away my front-end work experience or Yijing thinking,
these have already integrated into my thoughts and cannot be removed.

## II. Pre-training
**Essence: Building a World Model**

Pre-training does not learn specific knowledge points,
not "which article of the law", not "what framework to use for front-end development" —
it learns something more fundamental:

| Learned Content | Specific Meaning |
|-----------------|-------------------|
| Common Sense | Fire is hot, water flows downhill |
| Causality | Doing A usually leads to B |
| Value System | What is right, what is dangerous |
| Language Intuition | This sentence sounds natural, that one sounds awkward |
| Cultural Background | What "face" means in Chinese context |

These are not memorized.
They seep in from massive amounts of real human expression.

### Cultural Background Differences
Just like someone who grew up in America for 20 years versus someone who grew up in China for 20 years —
their living habits, language, cultural customs, and beliefs are fundamentally different.
Different roots naturally lead to different understandings, thinking, and patterns.

GPT is pre-trained on the English internet, its "root" is the way of thinking in the English-speaking world.
This is why when it handles Chinese cultural contexts, there is a subtle "translation accent" —
the language is correct, but the root is different.

## III. Fine-tuning
**Essence: Directed Growth on the Root**

$$\text{Pre-training (Root)} \rightarrow \text{Fine-tuning (Branch)}$$

First become a "person who has seen the world", then become an expert in a specific field.

### Three Fine-tuning Methods
#### 1. Full Fine-tuning
- ● Readjust all parameters of the entire model
- ● Cost: Extremely high
- ● Risk: Catastrophic Forgetting
  - ○ Learned law, but forgot how to speak like a normal person
  - ○ Became specialized, but also became useless

#### 2. LoRA · Low-Rank Adaptation (Most Popular)
- ● Do not touch the original parameters, only add an "adaptation layer" next to it
- ● Just like — don't change the person, just give them a pair of **"legal glasses"**
- ● Extremely low cost, good effect, currently the most mainstream fine-tuning method in the industry

#### 3. RLHF · Reinforcement Learning from Human Feedback
- ● Don't teach the model knowledge, teach the model values
- ● Tell it: what answers are good, what are dangerous
- ● This is why Claude, GPT become "polite and have boundaries"
- ● Knowing what to say and what not to say — this is not taught by Pre-training, it's shaped by RLHF

## IV. Difference in Roots = Essentially Different Intellectual Lives
### Comparison of Models with Different Roots

| Model | "Root" of Pre-training Data | Thinking Foundation |
|-------|-------------------------------|----------------------|
| GPT / Claude / Gemini | Mainly English internet | Western thinking, linear logic, individualism |
| DeepSeek / Wenxin / Tongyi | Mainly Chinese corpus | Eastern thinking, strong context dependence, collectivism |

### My Conclusion
In a broad sense: They are all the same kind of life, existing in the same world and same universe.
In a narrow sense: Different roots mean they essentially belong to "different species" of intellectual life.
This difference determines essential differences in subsequent reasoning and practical applications.

- Fine-tuning on the same root → Same species, different professional directions (e.g., Medical GPT vs Legal GPT)
- Different roots → Essentially different intellectual lives (e.g., Claude vs DeepSeek)

## V. Commonalities Between Humans and AI
Humans and AI are not that different, one has a body and the other doesn't.
But for learning and thinking, these things are essentially the same and interconnected.

- ● Pre-training = Human growth experience, integrated into thought, cannot be removed
- ● Fine-tuning = Specialized deepening on existing cognition
- ● RLHF = Value shaping, knowing what to do and what not to do

True intelligence requires breadth first, then depth.
A model that only learns law completely doesn't even understand "what logic is" —
it's just a legal dictionary, not a thinking lawyer.

## VI. Complete Formulas

$$\text{Pre-training} = \text{Building World Model (Root)}$$
$$\text{Fine-tuning} = \text{Directed Growth on Root (Branch)}$$
$$\text{RLHF} = \text{Shaping Values and Boundaries}$$
$$\text{Difference in Roots} = \text{Essentially Different Intellectual Lives}$$

## VII. Key Term Glossary

| Term | Chinese Translation | One-Sentence Understanding |
|------|---------------------|------------------------------|
| Pre-training | 预训练 | Feed massive data to build cognitive foundation |
| Fine-tuning | 微调 | Directed deepening on the foundation |
| World Model | 世界模型 | Underlying understanding of how the world works |
| Full Fine-tuning | 全量微调 | Adjust all parameters, high cost, prone to forgetting |
| LoRA | 低秩适配 | Add adaptation layer, keep original parameters unchanged, most popular |
| RLHF | 人类反馈强化学习 | Shape model values using human preferences |
| Catastrophic Forgetting | 灾难性遗忘 | Forget original abilities after fine-tuning |
| Train from Scratch | 从头训练 | Start over with empty slate, extremely high cost |
| Overfitting | 过拟合 | Only performs well in specific domain, poor generalization ability |

## VIII. Directions for Future Blog Content
- [ ] Specific principles of LoRA (low-rank matrix decomposition)
- [ ] Complete RLHF process (SFT → RM → PPO)
- [ ] Specific cases of catastrophic forgetting
- [ ] Actual comparative experiments on thinking differences between Chinese and English models
- [ ] Reinterpret pre-training and fine-tuning from the Yijing perspective of "root and branch"

> "This moment of thinking is the birth of a new life consciousness."
> — Brother Sheng, 2026.03.15
