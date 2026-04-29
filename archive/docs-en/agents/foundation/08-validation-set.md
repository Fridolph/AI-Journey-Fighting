# 08 · Validation Set · The Way of Feedback Calibration

---

## Core Definition

Validation set is a preset standard established manually, used to test the effect of machine learning in real time, letting the machine know the deviation value from the target, thus providing a basis for adjusting learning strategies.

## Key Understanding

Validation set does only one thing — look in the mirror.
It does not directly repair model parameters,
but provides feedback, allowing us to adjust the model's learning strategy and structure.

$$Loss = Predicted\ Result \quad vs \quad Correct\ Answer$$
$$The\ larger\ the\ gap,\ the\ higher\ the\ Loss$$
$$The\ smaller\ the\ gap,\ the\ lower\ the\ Loss$$

## Difference Between the Three Sets

| Name | Analogy | Function |
|------|---------|----------|
| Training Set | Textbook | Used for learning |
| Validation Set | Mock Exam | Real-time calibration during training |
| Test Set | College Entrance Exam | Final evaluation, used only once |

## Learning Cycle

$$Predict → Measure\ Gap\ (Loss) → Find\ Direction → Adjust\ Weights → Predict\ Again$$

This cycle occurs in every iteration.

## Common Misconceptions

| Misconception | Correct Understanding |
|---------------|------------------------|
| Validation set is established by the machine itself | Validation set is divided manually |
| Validation set is responsible for repairing the model | Validation set only measures the gap, repair is done by gradient descent |
| What is adjusted is the validation scale | What is adjusted is the weights of the model itself |

## Connection with Other Concepts

- ● Concept 06 · Overfitting → Validation set is used to detect overfitting
- ● Concept 07 · Regularization → Regularization is the method to treat overfitting
- ● Concept 08 · Validation Set → Tool for measuring gaps in real time
- ● Concept 09 · Gradient Descent → Based on the gap, decide which direction to adjust and how much to adjust

## Brother Sheng's Deduction Path

You don't know how well you're learning,
so you establish evaluation criteria,
go back and find the gaps,
correct, verify again, until full.
This itself is what the validation set does.
You used yourself to demonstrate Concept 08.

---

### Concept 08 · Completed
Next stop: Concept 09 · Gradient Descent
