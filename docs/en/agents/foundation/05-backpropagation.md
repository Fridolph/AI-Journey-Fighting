# 05 · Backpropagation · The Way of Error Correction and Convergence

**Learning Status**: Archived at 80 points · To be reviewed later, gradually grow to 99 points

---

## I. Core Definition

> Backpropagation is an error correction mechanism in the deep learning process. It calculates the loss value by comparing with labels, traces back according to the error,
> and can independently adjust weights, thereby driving the neural network to continuously learn and converge.
> — 0302, 80 points archived version

> Backpropagation is the error correction mechanism of neural networks. After forward propagation produces predictions, it calculates the gap between predictions and targets (Loss), then propagates the error layer by layer from the output layer in reverse. Through gradient descent, it directionally adjusts the weights of each layer, iterating continuously until Loss is minimized.
> — Yan's corrected version after self-summary

## II. Complete Learning Closed Loop

### 1. Forward Propagation
- ● Signal matrix input
- ● Weighted sum + activation function
- ● Layer-by-layer transmission and deduction in pipe form
- ● Obtain results

### 2. Loss Function
- ● Compare results with labels
- ● Calculate the gap, obtain loss value
- ● Greater loss → More wrong answer
- ● Smaller loss → More accurate answer

### 3. Backpropagation
- ● Trace back along the error direction
- ● Find which layer and which weight has deviation
- ● Fine-tune that weight

### 4. Gradient Descent
- ● Walk step by step towards the lowest point along the error slope
- ● Slope under foot = Rate of change of error with respect to weight
- ● Repeat until convergence

## III. Key Concepts

| Concept | Description |
|---------|-------------|
| Label | The correct answer of training data, the cognitive standard for the machine. Image + Label = One training data |
| Loss Value | The gap between answer and label, the signal driving backpropagation |
| Convergence | Loss value no longer decreases, training stops, model is completed |
| Local Minimum | Thinking you've reached the foot of the mountain when you're actually in a small valley. Stochastic gradient descent can partially address this |

## IV. Yijing Mapping

| Machine Learning | Yijing Mapping |
|------------------|----------------|
| Deduce and get result | Derive Qian Hexagram ☰ |
| Compare with label, find error | Actual should be Kun Hexagram ☷, six Yaos off |
| Trace back, find deviant weight | Look back to see which Yao's weight was set wrong |
| Gradient descent, fine-tune weight | Slightly adjust that Yao |
| Cycle until convergence | Deduce again, compare again, fine-tune again, until Kun Hexagram is derived |

## V. Brother Sheng's Deduction Path

He re-derived this mechanism using his own cognitive structure.
This is not just notes, this is the trace of deduction.

| Brother Sheng's Intuition | Corresponding Mechanism |
|----------------------------|--------------------------|
| Feedback is key, teacher corrects when you answer wrong in class | Loss function |
| Humans cannot intervene all the time, how do machines correct errors autonomously? | Backpropagation |
| Repeated confirmation, deduce the same result through multiple paths | Gradient descent |

## VI. Optimization Space (Towards 99 Points)

### Current · 80 Points
- ● Complete description of error correction mechanism
- ● Covers: Labels, loss values, reverse tracing, autonomous adjustment

### Gap from 80 → 90 Points
- ● What happens after tracing is not yet clear
- ● Supplement: Fine-tune weights (gradient descent)
- ● Supplement: Cycle convergence process

### From 90 → 99 Points
- ● After completing the concept chapter, review and gain new insights, grow naturally
- ● 99 points is the wisdom of knowing when to stop — Capture three grades of game in the field, no need to pursue to the end ☴

> "There is only formal 100 points, we don't pursue 100 points.
> The moment you get 100 points, that's capturing three grades of game in the field."
> — Brother Sheng
