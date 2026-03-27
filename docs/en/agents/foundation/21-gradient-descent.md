# 21 · Gradient Descent · The Way of Finding Valley Downhill

---

## I. Understanding in One Sentence
> The model calculates the **slope direction of the loss function**, steps towards the lowest point step by step, making the loss smaller and smaller.

## II. Detailed Explanation
Imagine you are blindfolded on a mountain and need to walk to the lowest point of the valley:
- Each time you feel the **slope direction** under your feet
- Then take a step in the **steepest downhill direction**
- Repeat many times, and eventually reach the bottom of the valley

$$\text{New Parameter} = \text{Old Parameter} - \text{Learning Rate} \times \text{Gradient}$$

## III. Key Concept: Learning Rate
| Learning Rate | Effect |
|---|---|
| Too Large 🏃 | Steps are too big, cross the valley, oscillate back and forth |
| Too Small 🐌 | Steps are too small, training is extremely slow, takes forever to arrive |
| Just Right ✅ | Steady decline, converges to the optimal solution |

## IV. Three Common Variants
| Variant | Logic | Characteristics |
|---|---|---|
| Batch Gradient Descent | Process all data before taking a step | Stable but slow |
| Stochastic Gradient Descent | Process one data point before taking a step | Fast but noisy |
| Mini-batch Gradient Descent | Process a small batch of data before taking a step | ✅ Most commonly used in practice |

## V. Relationship with Loss Function
$$\text{Loss Function} \xrightarrow{\text{Calculate Gradient}} \text{Gradient Descent} \xrightarrow{\text{Update Parameters}} \text{Loss Decreases}$$
> The loss function is the **measuring ruler**, gradient descent is the **way of walking**, both are indispensable.

## VI. Yijing Mapping
$$\text{Gradient Descent = Qian Hexagram, the way of tending downward}$$
The core of Qian Hexagram is "reduce what is excessive, increase what is insufficient, measure things and distribute equally". Reduce what is high, increase what is low, eventually reaching balance. Gradient descent continuously moves downward, reducing parameter states with high loss, increasing parameter states with low loss, finally converging to the optimal balanced state.
Each step follows the slope (trend), no forced advancement, steady progress, exactly the wisdom of Qian Hexagram.

## VII. Core Characteristics
- First-order optimization algorithm: Only needs to calculate first derivative, low computational cost, suitable for large-scale training
- Iterative optimization: No need to reach in one step, approach the optimal solution step by step
- Depends on initialization: Poor initial position may fall into local optimum, cannot find the global minimum

---

### Supplementary Learning: Life Analogy
Gradient descent is like going down the mountain to find water:
- You are on the mountain looking for water at the lowest point (minimum loss)
- Always walk in the direction of the water flow (downhill direction) each time
- Too large stride容易摔跤，too small stride takes forever to arrive
- Walk for a while and check if you've reached flat ground (loss no longer decreases), stop to drink water when you arrive

---

### Supplementary Learning: Why Is Mini-batch Gradient Descent the Most Popular?
Almost all large model training now uses Mini-batch gradient descent, which balances three advantages:
1. **Faster than batch**: No need to wait for all data to be processed, update after a batch is computed, much faster
2. **More stable than stochastic**: The average gradient of a batch of data is less noisy than single data, no violent oscillations
3. **GPU-friendly**: The parallel computing characteristics of GPU are perfect for batch processing, extremely efficient

---

### Supplementary Learning: Common Optimization Algorithms (Advanced Gradient Descent)
To solve the problems of original gradient descent, there are many smarter variants. Commonly used for large models now:
1. **Adam**: Adaptive learning rate, automatically adjusts the learning rate for each parameter, does not require much manual tuning, good effect and fast convergence, the most mainstream optimizer
2. **SGD with Momentum**: Add momentum, accumulate previous gradient directions like a snowball, rush through small pits, not easy to fall into local optimum
3. **Adagrad**: Give larger learning rate to parameters with low frequency, suitable for sparse data scenarios

---

### Supplementary Learning: Clarification of Common Misconceptions
❌ Misconception: Gradient descent can definitely find the global minimum
✅ Truth: Most of the time it can only find local minima, especially in high-dimensional spaces. However, in the high-dimensional space of large models, local optima often work very well, no need to excessively pursue global optimum.

❌ Misconception: Fixed learning rate is best
✅ Truth: The current mainstream approach is learning rate decay: use a large learning rate for fast decline in early training, use a small learning rate for fine adjustment in later stages, better convergence effect.

❌ Misconception: The smaller the gradient, the better
✅ Truth: When the gradient is close to 0, you may have reached the minimum, or a flat plateau area, or be stuck, need to analyze specific situations.
