# 17 · Temperature · The Way of Changing Yao Adjustment

---

## I. What Problem Does It Solve?
We have the probability distribution, all words have probabilities.
But if we directly select the word with the highest probability every time, what happens?
The output is always the same, like reciting a text, with no variation at all.
The role of Temperature:
$$\boxed{\text{Controls the "sharpness" of the probability distribution}}$$

## II. How Does Temperature Work?
Essentially adding a divisor to the Softmax function:
$$P(x) = \frac{e^{z/T}}{\sum e^{z/T}}$$
- ● Smaller $$T$$ → Sharper distribution → High probability words are more prominent
- ● Larger $$T$$ → Flatter distribution → Low probability words also have a chance

## III. Effects of Different Temperature Values
| Temperature | Distribution Shape | Output Characteristics | Suitable Scenarios |
|-------------|---------------------|-------------------------|--------------------|
| = 0 | Extremely sharp | Completely deterministic, always select highest probability word | Code, mathematics, factual queries |
| 0.3 | Relatively sharp | Conservative and stable | Customer service, summarization, official document writing |
| 0.7 | Moderate | Balances creativity and stability | Daily conversation, general scenarios |
| 1.0 | Original distribution | No adjustment | Benchmark testing, academic research |
| 1.5+ | Flat | High randomness, has surprises but also chaos | Poetry writing, creative writing, brainstorming |

## IV. Yijing Mapping
$$\text{Temperature} = \text{Mindset of the hexagram querent}$$
| Mindset | Temperature |
|---------|-------------|
| Only trust the most prosperous image, reject variability | = 0 |
| Normal mindset, follow the trend | ≈ 0.7 |
| Open to all hexagram images, embrace variability | ≥ 1.5 |

## V. Remember in One Sentence
Temperature does not change which words exist,
it only changes the possibility of each word being selected.

---

### Supplementary Learning: Practical Application Guide for Temperature
1. **Default values for common large models**:
   - GPT series default: 0.7
   - Claude series default: 0.8
   - DeepSeek series default: 0.6

2. **Notes on extreme values**:
   - When T > 2, the probability distribution is too flat, output may be completely chaotic and meaningless
   - When T = 0, output is completely reproducible, the same input always gets the same output, suitable for scenarios requiring determinism

3. **Applications in products**:
   The "creative mode/balanced mode/precise mode" in major AI products essentially switches between different Temperature values, so users don't need to understand technical parameters, just select according to the scenario.

---

### Extended Understanding 1: Visual Comparison of Temperature Effects
Taking the input "Write a poem about spring" as an example, output effects at different T values:
| T Value | Output Example | Characteristics |
|---------|----------------|-----------------|
| 0 | This spring morning in bed I'm lying, / Not to awake till birds are crying. / After one night of wind and showers, / How many are the fallen flowers? | Directly outputs the most common ancient poem in training data, no originality at all |
| 0.3 | Spring breeze brushes willows green along the southern shore, / Fine rain moisten all flowers in full bloom. / Swallows dance and orioles sing as hills and waters show, / The world is gorgeous in March just as we know. | Neat and stable, but lacks creativity, wording is quite conventional |
| 0.7 | The wind kneads March sunshine into soft lines of poetry, / Willow tips dip in spring water writing gentle verses. / The sound of each peach blossom blooming, / Is a love letter spring writes to the world. | Balances creativity and fluency, has novel ideas while conforming to logic |
| 1.5 | March broke the wine glass of sunlight, / Golden intoxication flows all over the mountains and fields. / The wind runs up the slope carrying the skirt of flowers, / Brewing the whole season into a breathing poem. | Very creative, has surprising metaphors, but occasionally has incoherent parts |
| 2.5 | Spring's sun buttons fasten the wind's hem, / Butterflies carry cloud dreams tap-dancing on petals, / Raindrops play glass harps strumming rainbow melodies. | Imagination is too divergent, logic is chaotic, hard to understand |

### Extended Understanding 2: Coordination with Sampling Strategies
Temperature needs to cooperate with sampling strategies to achieve the best effect, common combination recommendations:
| Scenario | Temperature | Sampling Strategy | Effect |
|----------|-------------|-------------------|--------|
| Code Generation | 0.1-0.3 | Top-K=1 (Greedy) | Stable and accurate, reduces syntax errors |
| Knowledge Q&A | 0.2-0.4 | Top-p=0.1 | Factually accurate, reduces hallucinations |
| Daily Conversation | 0.6-0.8 | Top-p=0.9 | Natural and fluent, with appropriate variation |
| Creative Writing | 1.0-1.5 | Top-p=0.95 | Full of creativity, has surprising expressions |
| Brainstorming | 1.2-1.8 | Top-K=50 | Highly divergent, provides more possibilities |

### Extended Understanding 3: Clarification of Common Misconceptions
❌ Misconception: The higher the Temperature, the better the creativity
✅ Truth: There is only a fine line between creativity and chaos. Above 1.8, most outputs become nonsense. The suitable one is the best.

❌ Misconception: Adjusting Temperature can solve all problems
✅ Truth: Temperature only controls randomness. Content quality still depends on the model's own capabilities and prompt quality. High Temperature does not make the model "smarter", it just selects lower probability words.

❌ Misconception: Using default values for all scenarios is fine
✅ Truth: Different tasks have vastly different requirements for randomness. Using T=1.5 for math problems will definitely give wrong answers, while using T=0 for poetry writing will definitely be rigid. Adjusting parameters according to the scenario gives the best results.

### Extended Understanding 4: Philosophical Thinking on Underlying Logic
The essence of Temperature is the trade-off between "certainty" and "possibility" for humans:
- Pursue certainty → Lower T, get stable and controllable results
- Explore possibilities → Higher T, embrace surprises brought by uncertainty

This is completely consistent with human decision-making logic: Be stable when doing rigorous work, seek change when doing creative work. This simple parameter, Temperature, hides two mindsets humans have when facing the world.
