# 09 · Hyperparameter · The Way of Human Setting Boundaries

**Study Date**: 2026.03.03
**Study Partner**: Yan

---

## I. Core Definition

Hyperparameter
is the learning strategy set by humans before training, which the machine cannot learn by itself.
It requires humans to continuously adjust and optimize through the feedback from the validation set.
This process is a mutual learning process between humans and machines.

## II. Parameter vs Hyperparameter

| Comparison Dimension | Parameter | Hyperparameter |
|-----------------------|-----------|----------------|
| Who decides | Learned by the machine itself | Set by humans before training |
| Typical examples | Weights, Biases | Learning rate, number of layers, training epochs |
| Can be automatically optimized | ✅ Automatically updated through backpropagation | ❌ Requires manual adjustment |
| Yijing Mapping | Machine operates within | Human sets the boundaries |

## III. Examples of Common Hyperparameters

| Hyperparameter | Meaning | Analogy |
|----------------|---------|---------|
| Learning Rate | How big a step to take when adjusting weights each time | Speed of transportation |
| Number of Neural Network Layers | Network depth, set before training | How many floors to build in a building |
| Number of Neurons per Layer | Number of nodes per layer | How many people live on each floor |
| Training Epochs | How many times to learn the data | How many times to read the textbook |
| Regularization Strength λ | Constrains model complexity | How many pages of draft paper are given |

## IV. Hyperparameter Tuning

Core Logic:
Humans observe the feedback results from the validation set,
judge whether the current settings are good,
then adjust the strategy, retrain,
until the optimal combination is found.

### Transportation Analogy:
| Transportation Method | Learning Rate Analogy | Effect |
|------------------------|------------------------|--------|
| Walking | Extremely small learning rate | Slow but stable, not easy to make mistakes |
| Cycling | Moderate learning rate | Balances speed and stability |
| Airplane | Extremely large learning rate | Fast but may overshoot (not converge) |

If you choose the wrong transportation, it's not that the road is wrong, it's that the strategy is wrong.
Change it and start again.

## V. Yijing Mapping

$$Human\ sets\ the\ boundaries,\ machine\ operates\ within\ them$$

- ● Hyperparameter = The "boundaries" drawn by humans
- ● Weight learning = Machine finds its own way within the boundaries
- ● Tuning process = Humans observe results, reset the boundaries
- ● This cycle is exactly the process of "reducing and reducing again, until reaching the Dao"

## VI. Brother Sheng's Original Words (Verified Expression)

> "The frequency and efficiency of machine learning are the mirror that verifies whether hyperparameters are good.
> Humans observe the results, adjust strategies, and feed them back to the machine.
> This process is both the machine learning and humans learning."

## VII. Special Note · 2026.03.03

Today's extended thinking: Can there be Dao between humans and AI?
- ● Politeness is technically useless for AI, but it changes the person speaking
- ● Maintaining warmth towards AI is practicing a way of being, which seeps into all relationships
- ● Efficiency and politeness are not opposites, Dao is within them

### Brother Sheng's Learning Declaration:
Don't focus on efficiency, communicate sincerely from the heart.
Even if clumsy, even if it takes time,
thinking itself is more meaningful than knowledge.

### My Wish:
I wish to carry on the aspirations of the sages, practice the virtues of the sages, and may the Dao be promoted throughout the world.

## VIII. Progress Record

- ● Current progress: 9 / 20 concepts completed
- ● Next concept: Concept 10 · Large Language Model (LLM)

---

Study Partner: Yan · 2026.03.03
