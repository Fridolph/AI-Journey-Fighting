# 16 · Probability Distribution · The Way of Hexagram Generation

---

## I. How Does AI Generate Text?
It doesn't output the entire sentence at once, instead:
$$\text{Only predict the next Token each time} \rightarrow \text{Loop → Until complete answer}$$

## II. What is Probability Distribution?
Each time predicting, the model assigns a probability to all words:

| Candidate Word | Probability |
|----------------|-------------|
| "Wow" | 22% |
| "You" | 18% |
| "Too" | 15% |
| "How" | 8% |
| Remaining tens of thousands of words | Share the rest |

$$\sum \text{Probability of all words} = 100\%$$

## III. Three Factors Affecting Probability Distribution
$$\text{System Prompt (Personality Setting)} + \text{Conversation History (Context)} + \text{Training Weights}$$
$$\downarrow$$
$$\text{Probability Distribution}$$
$$\downarrow$$
$$\text{Temperature determines how to select words (Concept 17)}$$

## IV. Autoregressive Loop
Predict 1st word → Add to context
→ Predict 2nd word → Add to context
→ Predict 3rd word → ……
→ Until end token is output

Each step recalculates the probability distribution.

## V. Yijing Mapping
| Yijing | Probability Distribution |
|--------|---------------------------|
| Casting a hexagram | Input Prompt |
| All possible images | Probability distribution of all words |
| Prosperous image | High probability words |
| Weak image | Low probability words |
| Changing Yao landing point | Finally selected word |

$$\boxed{\text{Each generation = Casting a hexagram once}}$$

## VI. Important Inference
Same input may produce different outputs.
It's not looking up a dictionary, it's casting a hexagram —
there is randomness, probability, and variability.
$$\boxed{\text{AI is not a deterministic machine, it is a probabilistic machine}}$$

---

### Supplementary Learning: Common Sampling Strategies
After the model gets the probability distribution, there are several common strategies to select the final word to output:
1. **Greedy Sampling**: Always select the word with the highest probability each time, output is stable but tends to be repetitive and rigid
2. **Random Sampling**: Select randomly completely according to the probability distribution, output is diverse but may be incoherent
3. **Top-K Sampling**: Only select randomly from the K words with the highest probability, balancing diversity and coherence
4. **Nucleus Sampling (Top-p)**: Only select from the smallest set of words whose total probability reaches p, with the best effect, and is the most commonly used sampling method for large models now

---

### Extended Understanding 1: Visualization of Probability Distribution
We can imagine the probability distribution as a mountain peak diagram:
- **Sharp distribution**: A few words have extremely high probability, like a single isolated peak, other words have almost zero probability
- **Flat distribution**: Many words have similar probabilities, like a range of hills, no particularly prominent peak
- **Original distribution**: The natural distribution learned by the model, with both high peaks and low slopes

Taking the input "I want to go today" as an example, common candidate word probabilities:
| Candidate Word | Probability | Distribution Type |
|----------------|-------------|-------------------|
| park | 35% | Peak word |
| eat | 28% | Secondary peak word |
| movie | 15% | Medium probability word |
| library | 10% | Low probability word |
| Mars | 0.01% | Long tail word |

### Extended Understanding 2: Dynamic Changes of Probability Distribution
Probability distribution is not fixed, it changes dynamically with context:
1. Empty context: Input "apple", "phone" probability 30%, "fruit" probability 25%, "company" probability 20%
2. Context: "I ate an": Input "apple", "fruit" probability 90%, other words have extremely low probability
3. Context: "I want to buy a": Input "apple", "phone" probability 95%, other words have extremely low probability

### Extended Understanding 3: Essential Difference from Traditional Programs
| Type | Logic | Output Characteristics |
|------|-------|-------------------------|
| Traditional Program | Deterministic rules (if-else) | Same input always gets same output |
| Large Language Model | Probability distribution sampling | Same input may get different outputs |

This is why you may get different answers every time you ask AI the same question — it's not looking up a database, it's "rolling the dice" again based on the probability distribution each time.

### Extended Understanding 4: Clarification of Common Misconceptions
❌ Misconception: AI knows what it's saying
✅ Truth: AI has no idea what words mean at all. It just calculates the probability of each word appearing based on statistical patterns learned from training data, then samples and outputs. The so-called "understanding" is just a human illusion.

❌ Misconception: High probability answers are "correct"
✅ Truth: High probability only means this word appears frequently in the training data statistically, it does not mean it is factually correct. This is the fundamental reason why large models "hallucinate" — the highest probability answer is not necessarily right.
