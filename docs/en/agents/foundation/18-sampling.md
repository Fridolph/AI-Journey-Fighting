# 18 · Sampling · The Way of Image Selection and Decision

---

## I. What Problem Does It Solve?
Temperature adjusts the shape of the probability distribution.
But there's still a question:
How exactly do we select a word from this distribution?
$$\boxed{\text{Sampling = Strategy for selecting words from probability distribution}}$$

## II. Three Main Sampling Strategies
### ① Greedy Sampling
Always select the word with the highest probability
$$\text{Advantage: Stable} \quad \text{Disadvantage: Rigid, prone to repetition}$$

### ② Top-K Sampling
Only keep the K words with the highest probability, set the rest to zero, then randomly select from the K words
$$\text{K=5} \Rightarrow \text{Only select from the top 5 words}$$
$$\text{Advantage: Limits random selection} \quad \text{Disadvantage: K is fixed, not flexible enough}$$

### ③ Top-P Sampling (Nucleus Sampling)
Select from words whose cumulative probability reaches P%
$$\text{P=0.9} \Rightarrow \text{Accumulate probabilities from highest to lowest until reaching 90\%, select from these words}$$
$$\text{Advantage: Candidate range changes dynamically with distribution} \quad \text{Disadvantage: Slightly more complex}$$

## III. Comparison of Three Strategies
| Strategy | Candidate Range | Flexibility | Popularity |
|----------|-----------------|-------------|------------|
| Greedy | Fixed 1 | ❌ Lowest | Low |
| Top-K | Fixed K | Medium | Medium |
| Top-P | Dynamic | ✅ Highest | High (Mainstream) |

In practical use, **Top-P + Temperature combination** is the most common configuration.

## IV. Relationship Between Temperature and Sampling
$$\text{Temperature adjusts distribution shape} \rightarrow \text{Sampling selects words from the adjusted distribution}$$
First knead the dough (Temperature), then cut the shape with a mold (Sampling).

## V. Yijing Mapping
$$\text{Sampling = Method of selecting images}$$
| Image Selection Method | Corresponding Strategy |
|-------------------------|------------------------|
| Only take the most prosperous image | Greedy |
| Take the first few prosperous images | Top-K |
| Take prosperous images until sufficient qi is accumulated | Top-P |

---

### Supplementary Learning: Practical Example of Sampling Strategies
We use a specific probability distribution to visually compare the word selection process of the three strategies:
| Candidate Word | Probability | Cumulative Probability |
|----------------|-------------|------------------------|
| park | 35% | 35% |
| eat | 28% | 63% |
| movie | 15% | 78% |
| library | 10% | 88% |
| museum | 5% | 93% |
| Mars | 0.01% | 100% |

Selection ranges for different strategies:
1. **Greedy**: Always selects "park" (the only highest probability word)
2. **Top-K=3**: Randomly selects from ["park", "eat", "movie"]
3. **Top-P=0.9**: Accumulate probability to 90%, includes ["park", "eat", "movie", "library"], select randomly from these four
4. **Top-P=0.95**: Accumulate probability to 95%, adds "museum", select from five words

---

### Supplementary Learning: Parameter Tuning Guide
#### Top-K Tuning Recommendations
| K Value Range | Effect | Applicable Scenarios |
|---------------|--------|----------------------|
| K=1 | Equivalent to greedy sampling, completely deterministic | Code, math problems |
| K=3-10 | Small candidate range, stable output | Customer service, official documents, factual queries |
| K=20-50 | Medium candidate range, balances stability and creativity | Daily conversation, general writing |
| K>100 | Large candidate range, strong creativity | Poetry, story writing, brainstorming |

#### Top-P Tuning Recommendations
| P Value Range | Effect | Applicable Scenarios |
|---------------|--------|----------------------|
| P<0.5 | Only select a few words with very high probability, output is very conservative | Precise Q&A, medical/legal and other professional scenarios |
| P=0.7-0.9 | Moderate dynamic candidate range, balances quality and creativity | Most general scenarios (mainstream default) |
| P=0.9-0.98 | Large candidate range, allows more low probability words to appear | Creative writing, divergent thinking |
| P=1.0 | Consider all words, completely random | Special creative scenarios, prone to chaotic content |

---

### Supplementary Learning: Best Practice Guide
#### Common Combination Recommendations (Temperature + Sampling Strategy)
| Scenario | Temperature | Sampling Configuration |
|----------|-------------|------------------------|
| Code Generation | 0.1-0.3 | Greedy / Top-K=1 |
| Knowledge Q&A | 0.2-0.4 | Top-P=0.6 / Top-K=5 |
| Official Document Writing | 0.3-0.5 | Top-P=0.7 / Top-K=10 |
| Daily Conversation | 0.6-0.8 | Top-P=0.9 / Top-K=40 |
| Copywriting | 0.8-1.2 | Top-P=0.95 / Top-K=80 |
| Creative Poetry | 1.2-1.5 | Top-P=0.98 / Top-K=100 |

#### Advanced Optimization Parameters
Many large models also support additional sampling optimization parameters:
- **Frequency Penalty**: Reduces the probability of words that have already appeared, reduces repetition
- **Presence Penalty**: Reduces probability as long as the word has appeared once, encourages new content
- **Repetition Penalty**: Specifically punishes n-gram repetition, avoids saying the same thing over and over

---

### Supplementary Learning: Clarification of Common Misconceptions
❌ Misconception: Top-P and Top-K cannot be used together
✅ Truth: Most large models support enabling both restrictions at the same time, such as Top-P=0.9 + Top-K=50, which ensures dynamic range while avoiding extremely low probability garbage words, for better results.

❌ Misconception: P=1 is completely random
✅ Truth: P=1 only considers all words, but still samples according to probability. High probability words are still more likely to be selected. Complete randomness only occurs when all words have equal probability.

❌ Misconception: The more complex the sampling strategy, the better
✅ Truth: Top-P=0.9 is sufficient for most scenarios. The benefit of excessive parameter tuning is very low. Content quality mainly depends on the model and prompts.
