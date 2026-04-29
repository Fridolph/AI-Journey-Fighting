# 20 · Loss Function · The Way of Error Measurement Ruler

---

## I. Understanding in One Sentence
> How far is the model's answer from the correct answer? The loss function is that **measuring ruler**.

## II. Detailed Explanation
Imagine you are practicing shooting basketball:
- After each shot, someone tells you "10cm to the left" — this **10cm is the loss value**
- Smaller loss = More accurate shot
- The goal of training is to make the loss value **decrease continuously**

$$\text{Loss Value} = \text{Some calculation of } (\text{Model Prediction} - \text{Ground Truth})$$

## III. Two Common Loss Functions
| Name | Used For | Intuitive Understanding |
|---|---|---|
| **MSE** Mean Squared Error | Regression tasks (predict numbers) | Square each error then take average, penalizes large errors heavily |
| **Cross Entropy** | Classification tasks (predict categories) | Measures how far the predicted probability distribution is from the real distribution |

> Large language models use **Cross Entropy** — each time predicting the next Token, check if the prediction is correct.

## IV. Working Logic
The loss function is the baton of model training:
1. Model gives prediction result
2. Loss function calculates the gap with the correct answer
3. Backpropagation adjusts model parameters based on the loss value
4. Repeat until the loss value stops decreasing, model training is complete

Without a loss function, the model has no idea if its predictions are right or wrong, and cannot learn at all.

## V. Yijing Mapping
$$\text{Loss Function = Calibration ruler for divination accuracy}$$
After each divination, compare with the actual outcome to see how far the previous judgment was off. Next time you divine, adjust your hexagram interpretation approach to become more accurate.
The loss value is the gap between the divination result and the actual outcome, and training is the process of continuously calibrating the hexagram interpretation approach.

## VI. Core Characteristics
- Differentiable: Must be able to calculate gradients for backpropagation to adjust parameters
- Non-negative: Error cannot be negative, loss is 0 when prediction is perfect
- Monotonic: The larger the error, the higher the loss value, guiding the model to reduce error

---

### Supplementary Learning: Life Analogy
The loss function is like the teacher grading exams:
- You answer the questions (model prediction)
- The teacher grades against the standard answer, gives you a score (calculates loss value)
- You review wrong questions to improve, aim for better scores next time (model adjusts parameters)
- Full score (loss = 0) means completely correct prediction

---

### Supplementary Learning: Why Do Large Models Use Cross Entropy?
Each time a large language model predicts the next word, it is essentially a classification task: choosing the correct one from tens of thousands of words. Cross Entropy is particularly suitable for this scenario:
1. Heavy penalty for wrong predictions: The lower the probability of the correct word, the faster the loss value increases
2. Appropriate gradient: No vanishing or exploding gradients, more stable training
3. Native probability support: Naturally matches the probability distribution output by the model, computationally efficient

---

### Supplementary Learning: Clarification of Common Misconceptions
❌ Misconception: The lower the loss value, the better the model
✅ Truth: If training set loss is very low but test set loss is very high, it's overfitting. The model memorized training data but can't generalize, which is actually worse.

❌ Misconception: Use the same loss function for all tasks
✅ Truth: Different tasks have different goals, need to choose corresponding loss functions. For example, use MSE for house price prediction, cross entropy for image classification, GAN-specific loss for generative adversarial networks.

❌ Misconception: Loss value must reach 0 to be best
✅ Truth: It's almost impossible to reach 0 loss in real scenarios. Moreover, forcing 0 loss easily leads to overfitting. You can stop training when the validation set loss no longer decreases.
