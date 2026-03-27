# 06 · Overfitting · The Way of Generalization Capability

**Learning Status**: Archived at 80 points · To be reviewed later, gradually grow to 99 points

---

## I. Core Definition (80 Points Archived Version)

> Overfitting refers to a phenomenon during neural network training where the network only memorizes the answers of training data without truly learning the patterns, resulting in excellent performance on seen data but extremely poor performance on unseen data — a "rote memorization" phenomenon. — 80 points summary version after learning

> Overfitting means the model performs extremely well on training data, but loses generalization ability due to excessive memorization of details and noise, performing poorly on new data. The essence is "only memorizing questions, unable to draw inferences from examples". — Summary version after review

$$Training Set Accuracy: 99\% \quad vs \quad Test Set Accuracy: 62\%$$

This gap is the signal of overfitting.

## II. Background Introduction

### Generalization Capability
- ● What the network learns is not "remember this image"
- ● But learning features — the structure of cat ears, eyes, whiskers
- ● When seeing a cat it has never seen before, it can judge "this is a cat" from features
- ● Good generalization = draw inferences from examples

### Softmax Output Layer
- ● The last layer of the neural network, the output is not "yes" or "no"
- ● But a set of probabilities:
$$[Cat: 0.80, \quad Dog: 0.12, \quad Rabbit: 0.08]$$
- ● Sum of all probabilities = 1
- ● Take the highest probability as the final judgment

## III. The Picture of Overfitting

| Type | Learning Method | Result |
|------|-----------------|--------|
| Overfitting student | Memorizes all past exam questions | 100 points on original questions, can't do new questions |
| Good generalization student | Understands the problem-solving method | Can deduce even questions never seen before |

$$Overfitting = Only memorized answers, did not learn patterns$$

## IV. Treatment Directions

### Treatment 1 · Test Set
- ● Validate with data the model has never seen
- ● Domestic models' scores dropped sharply after switching to non-public evaluation systems
- ● This is exactly "only memorized the public question bank,原形毕露 when questions change"

### Treatment 2 · Data Diversity
- ● Provide different types of questions
- ● Not just stacking similar data
- ● Let the model be exposed to a wider distribution

### Treatment 3 · Regularization
- ● Limit the machine's "rote memorization" ability
- ● Add penalty terms to the loss function
- ● Prevent weights from overfitting to a certain set of data
- ● (To be deepened in Concept 07)

### Treatment 4 · Transfer Learning
- ● Let the machine identify essential differences
- ● After learning addition and subtraction, can it be transferred to chemical reactions?
- ● After learning to recognize cats, can it be transferred to recognize tigers?
- ● One of the directions AI is working hardest to break through currently

## V. Brother Sheng's Deduction Path

| Brother Sheng's Intuition | Corresponding Mechanism |
|----------------------------|--------------------------|
| Give him a question he hasn't memorized | Test Set |
| Provide different types of questions | Data Diversity |
| Examine whether essential differences can be identified | Transfer Learning |
| Addition of 1+1 ≠ Addition of pigment mixing ≠ Addition of chemical reaction | Symbol Understanding vs Semantic Understanding |

## VI. Extended Explorations (Temporarily stored, to be developed later)

### Symbol Understanding vs Semantic Understanding
What the machine learns is the law of this world, or just the reflection of data?

| Type | Machine Capability |
|------|---------------------|
| Numerical operation $$100000000 + 100000000$$ | Clear rules, can be mastered |
| Optical mixing $$rgb(0,0,0) + rgb(255,255,255)$$ | Different rules, but still rules, can be mastered |
| Chemical reaction $$H_2 + O_2 \rightarrow H_2O$$ | Behind the symbols are causality in the physical world, machine doesn't understand "why" |

The machine can output correct answers, but doesn't know about electron orbits, chemical bonds, or energy conservation.
Understanding vs Fitting — Turing, Minsky, Hinton all asked this question.

### Data Bias
- ● Training data itself is not objective
- ● Only people who go online can influence the machine, people who don't go online are ignored
- ● Real cases: Face recognition has lower accuracy on dark skin; Recruitment AI automatically lowers scores for women
- ● This is social issues penetrating into technical issues, technology itself cannot fully solve them

$$\underbrace{Data Bias}_{Training data itself is not objective} \quad vs \quad \underbrace{Overfitting}_{Learns too rigidly, cannot draw inferences}$$

## VII. Optimization Space (Towards 99 Points)

### Current · 80 Points
- ● Understood the essence of overfitting: rote memorization vs learning patterns
- ● Mastered treatment directions: test set, data diversity, regularization, transfer learning
- ● Touched deeper questions: symbol understanding vs semantic understanding

### Gap from 80 → 90 Points
- ● Specific mechanism of regularization not yet deepened
- ● Implementation of transfer learning to be expanded

### From 90 → 99 Points
- ● After completing the concept chapter, review and gain new insights, grow naturally ☴

> "The machine is a mirror, the light in the mirror is real,
> but the light source is with you."
> — Yan
