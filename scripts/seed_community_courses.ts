import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env file manually if process.env is not populated
function loadEnv() {
	const envPath = path.join(process.cwd(), '.env');
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, 'utf-8');
		for (const line of envContent.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eqIdx = trimmed.indexOf('=');
			if (eqIdx !== -1) {
				const key = trimmed.slice(0, eqIdx).trim();
				let val = trimmed.slice(eqIdx + 1).trim();
				if (
					(val.startsWith('"') && val.endsWith('"')) ||
					(val.startsWith("'") && val.endsWith("'"))
				) {
					val = val.slice(1, -1);
				}
				if (!process.env[key]) {
					process.env[key] = val;
				}
			}
		}
	}
}

loadEnv();

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const projectId =
	process.env.PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'study-fd50d';

if (!serviceAccountJson) {
	console.error('ERROR: FIREBASE_SERVICE_ACCOUNT is missing in environment or .env!');
	process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.private_key) {
	serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

if (getApps().length === 0) {
	initializeApp({
		credential: cert(serviceAccount),
		projectId: serviceAccount.project_id || projectId
	});
}

const db = getFirestore();

export const COMMUNITY_COURSES = [
	{
		id: 'cs229-stanford-ai',
		courseId: 'cs229-stanford',
		sharedByUid: 'stanford-official',
		sharedByName: 'Stanford AI Lab (Prof. Andrew Ng)',
		claimCount: 482,
		importCount: 482,
		isOfficial: true,
		tags: ['AI', 'Programming', 'Math'],
		level: 'advanced',
		revoked: false,
		snapshot: {
			title: 'CS229: Deep Learning & Neural Network Architectures',
			description:
				'Master mathematical foundations of supervised learning, deep convolutional neural networks, transformer self-attention, loss functions, and optimization.',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Supervised Learning, Loss Functions & Gradient Descent',
					summary:
						'Explore parametric learning models, Mean Squared Error, Binary Cross-Entropy loss, and stochastic gradient descent optimization algorithms.',
					pages: [
						{
							order: 1,
							heading: 'Foundations of Supervised Machine Learning',
							subheading: 'Mapping inputs to outputs using labeled data',
							body: 'Supervised learning models aim to learn a target function $h: X \\rightarrow Y$ from a training set of input-output pairs $(x^{(i)}, y^{(i)})$. In linear regression, we approximate $y$ using a linear combination of input features $x_j$ weighted by parameter vector $\\theta$: \n\n$$h_\\theta(x) = \\sum_{j=0}^{n} \\theta_j x_j = \\theta^T x$$\n\nTo evaluate model accuracy, we define a loss function $J(\\theta)$ measuring the discrepancy between prediction $h_\\theta(x^{(i)})$ and ground truth $y^{(i)}$. For regression, the Ordinary Least Squares (OLS) cost function is:\n\n$$J(\\theta) = \\frac{1}{2m} \\sum_{i=1}^{m} (h_\\theta(x^{(i)}) - y^{(i)})^2$$'
						},
						{
							order: 2,
							heading: 'Gradient Descent & Backpropagation',
							subheading: 'Iterative optimization algorithm for parameter updating',
							body: 'To minimize the cost function $J(\\theta)$, gradient descent iteratively adjusts parameters in the opposite direction of the gradient vector $\\nabla_\\theta J(\\theta)$:\n\n$$\\theta_j := \\theta_j - \\alpha \\frac{\\partial}{\\partial \\theta_j} J(\\theta)$$\n\nWhere $\\alpha$ represents the learning rate hyperparameter. In deep neural networks, gradients across multi-layered networks are computed efficiently via the Chain Rule of calculus, a process known as backpropagation. Learning rates must be tuned carefully: a rate too high causes divergence, while a rate too low results in slow convergence.'
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'Supervised Learning & Optimization Assessment',
					summary:
						'Test your understanding of cost functions, gradient descent mechanics, and activation functions.',
					questions: [
						{
							question:
								'What happens to Gradient Descent if the learning rate alpha is set too large?',
							options: [
								'It converges to the global minimum much faster without error',
								'It may overshoot the minimum and diverge or oscillate indefinitely',
								'It gets trapped in a local minimum immediately',
								'The gradient becomes zero for all parameters'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'An excessively large learning rate causes step sizes to exceed the valley bounds, leading parameters to overshoot the minimum and potentially diverge.'
						},
						{
							question:
								'Which loss function is standard for binary classification neural networks?',
							options: [
								'Mean Absolute Error (MAE)',
								'Binary Cross-Entropy (Log Loss)',
								'Huber Loss',
								'Hinge Loss'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'Binary Cross-Entropy measures the performance of a classification model whose output is a probability value between 0 and 1.'
						}
					]
				},
				{
					order: 3,
					type: 'lesson',
					title: 'Deep Neural Networks & Transformer Self-Attention',
					summary:
						'Delve into multi-layer perceptrons, convolutional layers for computer vision, and Scaled Dot-Product Attention in modern LLM architectures.',
					pages: [
						{
							order: 1,
							heading: 'Convolutional Neural Networks & Feature Extraction',
							subheading: 'Spatial hierarchies and shift invariance in computer vision',
							body: 'Convolutional Neural Networks (CNNs) process spatial grid structured data (such as images) using local receptive fields, shared weights, and spatial pooling operations. A 2D convolution applies a trainable filter matrix $K$ across input tensor $I$:\n\n$$S(i, j) = (I * K)(i, j) = \\sum_m \\sum_n I(i-m, j-n) K(m, n)$$\n\nBy stacking convolutional layers, lower layers detect simple edges while deeper layers aggregate features into high-level semantic concepts.'
						},
						{
							order: 2,
							heading: 'Transformer Architecture & Self-Attention Mechanics',
							subheading: 'Replacing recurrence with parallelized attention',
							body: 'The Transformer architecture (Vaswani et al.) revolutionized natural language processing by replacing recurrent neural networks with Scaled Dot-Product Attention. For query vector $Q$, key vector $K$, and value vector $V$ with dimension $d_k$:\n\n$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$\n\nMulti-Head Attention projects queries, keys, and values into multiple linear subspaces, enabling the model to attend to information from different representation subspaces simultaneously.'
						}
					]
				},
				{
					order: 4,
					type: 'quiz',
					title: 'Neural Network Architectures & Transformers Quiz',
					summary:
						'Evaluate knowledge of CNN filter operations, attention equations, and deep network training.',
					questions: [
						{
							question:
								'In Scaled Dot-Product Attention, why is the matrix product QK^T scaled by 1/sqrt(d_k)?',
							options: [
								'To reduce the total number of matrix multiplications',
								'To prevent dot products from growing excessively large for high dimensions, which would push softmax into regions with small gradients',
								'To make key vectors orthogonal to query vectors',
								'To convert logits into continuous Gaussian probability distributions'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'For large values of d_k, dot products grow large in magnitude, causing softmax to yield vanishing gradients during backpropagation. Scaling mitigates this effect.'
						}
					]
				}
			]
		}
	},
	{
		id: 'cs50-harvard-intro',
		courseId: 'cs50-harvard',
		sharedByUid: 'harvard-cs50',
		sharedByName: 'Harvard University (Prof. David J. Malan)',
		claimCount: 615,
		importCount: 615,
		isOfficial: true,
		tags: ['Programming'],
		level: 'beginner',
		revoked: false,
		snapshot: {
			title: 'CS50x: Introduction to Computer Science',
			description:
				'Harvard’s iconic introduction to computational thinking, C programming, manual memory management, data structures, algorithm complexity, Python, and SQL.',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Computational Thinking, C Syntax & Memory Management',
					summary:
						'Learn low-level programming concepts in C: data types, control flow, functions, memory layout, stack frames, and pointer arithmetic.',
					pages: [
						{
							order: 1,
							heading: 'Introduction to C & Variable Allocation',
							subheading: 'Compiling source code down to machine instructions',
							body: 'Computer science is at its core problem-solving: taking inputs, executing systematic steps (algorithms), and producing outputs. In C, source code `.c` files pass through a compiler (clang/gcc) consisting of four phases: preprocessing, compiling, assembling, and linking.\n\nVariables store data in distinct RAM locations with specific byte sizes: `char` (1 byte), `int` (4 bytes), `float` (4 bytes), and `double` (8 bytes). Memory addresses are denoted in hexadecimal format (e.g. `0x7ff7b...`).'
						},
						{
							order: 2,
							heading: 'Pointers & The RAM Memory Layout',
							subheading: 'Navigating Stack, Heap, and Raw Memory',
							body: 'A pointer is a variable that stores the memory address of another variable. In C, the address-of operator `&` extracts an address, while the dereference operator `*` accesses the value stored at an address.\n\n```c\nint n = 50;\nint *p = &n;\nprintf("%i\\n", *p); // Prints 50\n```\n\nRAM for an executing process is partitioned into: Text (machine instructions), Globals, Heap (dynamically allocated memory via `malloc()`), and Stack (local function frames). Unfreed heap memory causes memory leaks.'
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'C Fundamentals & Memory Management Quiz',
					summary:
						'Test knowledge of pointers, memory allocation, and stack vs heap behavior in C.',
					questions: [
						{
							question: 'What is the outcome of invoking malloc(sizeof(int) * 10) in C?',
							options: [
								'It automatically initializes 10 integer variables on the Stack with zero values',
								'It allocates a contiguous block of 40 bytes on the Heap and returns a pointer to the first byte',
								'It frees 10 integers from memory',
								'It converts C code directly into executable machine instructions'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'malloc allocates requested bytes on the Heap dynamically and returns a void pointer to the memory block.'
						}
					]
				},
				{
					order: 3,
					type: 'lesson',
					title: 'Data Structures, Hash Tables & Big-O Algorithm Analysis',
					summary:
						'Examine asymptotic time complexity, linked lists, hash functions, collision resolution, and binary search trees.',
					pages: [
						{
							order: 1,
							heading: 'Asymptotic Analysis & Big-O Notation',
							subheading: 'Quantifying theoretical running time and space efficiency',
							body: "Big-O notation describes the upper bound of an algorithm's growth rate as input size $n$ approaches infinity:\n\n- $O(1)$: Constant time (array index lookup)\n- $O(\\log n)$: Logarithmic time (binary search in a sorted array)\n- $O(n)$: Linear time (un-indexed array search)\n- $O(n \\log n)$: Linearithmic time (Merge Sort / Quick Sort average)\n- $O(n^2)$: Quadratic time (Bubble Sort / Insertion Sort)"
						},
						{
							order: 2,
							heading: 'Linked Lists & Hash Tables',
							subheading: 'Building dynamic collections in memory',
							body: 'Unlike fixed contiguous arrays, a Linked List consists of nodes containing data and a pointer `next` to the subsequent node. Inserting an element at the head is $O(1)$ constant time.\n\nA Hash Table combines the constant-time lookup of arrays with a hash function that maps key strings to array indices. Collisions occur when multiple keys map to the same index, resolved via separate chaining (linked list buckets).'
						}
					]
				},
				{
					order: 4,
					type: 'quiz',
					title: 'Algorithms & Data Structures Knowledge Check',
					summary:
						'Test concepts of asymptotic time complexity, linked list pointers, and hash table buckets.',
					questions: [
						{
							question:
								'What is the worst-case search time complexity for a binary search tree (BST) that has degenerated into a linked list?',
							options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
							correctIndex: 2,
							answerIndex: 2,
							explanation:
								'If items are inserted into an unbalanced BST in sorted order, the tree degenerates into a single long line (linked list), taking O(n) linear search time.'
						}
					]
				}
			]
		}
	},
	{
		id: 'mit-1806-linear-algebra',
		courseId: 'mit-1806',
		sharedByUid: 'mit-math',
		sharedByName: 'MIT Mathematics (Prof. Gilbert Strang)',
		claimCount: 390,
		importCount: 390,
		isOfficial: true,
		tags: ['Math', 'AI', 'Science'],
		level: 'intermediate',
		revoked: false,
		snapshot: {
			title: '18.06: Linear Algebra & Matrix Decompositions',
			description:
				'MIT’s foundational linear algebra course: elimination matrices, vector subspaces, Gram-Schmidt orthogonalization, Eigenvalues, and Singular Value Decomposition (SVD).',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'The Four Fundamental Subspaces & Solving Ax = b',
					summary:
						'Master matrix equations, Gaussian elimination, matrix rank, Column Space C(A), and Nullspace N(A).',
					pages: [
						{
							order: 1,
							heading: 'Vector Spaces & Matrix Subspaces',
							subheading: 'Column space, nullspace, and row space geometry',
							body: 'For an $m \\times n$ matrix $A$, linear combinations of its columns form the **Column Space** $C(A) \\subseteq \\mathbb{R}^m$. The system $Ax = b$ has a solution if and only if vector $b$ resides in $C(A)$.\n\nThe **Nullspace** $N(A) \\subseteq \\mathbb{R}^n$ consists of all vector solutions to homogeneous equation $Ax = 0$. According to the Fundamental Theorem of Linear Algebra:\n\n$$\\dim(C(A)) + \\dim(N(A)) = n$$\n\nWhere $r = \\dim(C(A))$ is the rank of matrix $A$.'
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'Vector Subspaces & Matrix Rank Quiz',
					summary:
						'Evaluate matrix rank calculation, nullspace dimension, and vector independence.',
					questions: [
						{
							question:
								'If a 4x5 matrix A has a rank r = 3, what is the dimension of its Nullspace N(A)?',
							options: ['1', '2', '3', '5'],
							correctIndex: 1,
							answerIndex: 1,
							explanation: 'By the Rank-Nullity theorem: dim(N(A)) = n - r = 5 - 3 = 2.'
						}
					]
				},
				{
					order: 3,
					type: 'lesson',
					title: 'Eigenvalues, Diagonalization & Singular Value Decomposition (SVD)',
					summary:
						'Study matrix characteristic equations det(A - lambda*I) = 0, symmetric matrix spectral theorem, and SVD factoring A = U Sigma V^T.',
					pages: [
						{
							order: 1,
							heading: 'Eigenvalues & Diagonalization',
							subheading:
								'Eigenvectors that maintain directional orientation under matrix transformation',
							body: 'An eigenvector $x \\neq 0$ of a square matrix $A$ satisfies $Ax = \\lambda x$, where scalar $\\lambda$ is the eigenvalue. Solving $\\det(A - \\lambda I) = 0$ yields the characteristic polynomial.\n\nIf $A$ has $n$ linearly independent eigenvectors, it can be diagonalized as:\n\n$$A = S \\Lambda S^{-1}$$\n\nWhere $S$ is the matrix of eigenvectors and $\\Lambda$ is the diagonal matrix of eigenvalues.'
						},
						{
							order: 2,
							heading: 'Singular Value Decomposition (SVD)',
							subheading: 'Factoring any arbitrary m x n real matrix',
							body: 'Singular Value Decomposition factors any matrix $A \\in \\mathbb{R}^{m \\times n}$ into orthogonal matrices $U$ and $V$, and diagonal matrix $\\Sigma$ containing singular values $\\sigma_i = \\sqrt{\\lambda_i(A^T A)}$:\n\n$$A = U \\Sigma V^T$$\n\nSVD is foundational in modern data science for Principal Component Analysis (PCA), low-rank matrix approximation, and dimensionality reduction.'
						}
					]
				},
				{
					order: 4,
					type: 'quiz',
					title: 'Eigen-Decomposition & SVD Practice Test',
					summary:
						'Assess understanding of matrix diagonalization, orthogonality, and singular values.',
					questions: [
						{
							question:
								'What are the matrices U and V in the Singular Value Decomposition A = U Sigma V^T guaranteed to be?',
							options: [
								'Upper Triangular Matrices',
								'Orthogonal Matrices (U^T U = I and V^T V = I)',
								'Diagonal Matrices with zero entries along the main diagonal',
								'Symmetric Matrices with negative eigenvalues'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'In SVD, U and V are orthogonal matrices whose columns form orthonormal bases for R^m and R^n respectively.'
						}
					]
				}
			]
		}
	},
	{
		id: 'mit-804-quantum-physics',
		courseId: 'mit-804',
		sharedByUid: 'mit-physics',
		sharedByName: 'MIT Physics Department (Prof. Barton Zwiebach)',
		claimCount: 275,
		importCount: 275,
		isOfficial: true,
		tags: ['Science', 'Math'],
		level: 'advanced',
		revoked: false,
		snapshot: {
			title: '8.04: Quantum Physics I & Wave Mechanics',
			description:
				'MIT’s introductory quantum mechanics: de Broglie wave-particle duality, wave packets, time-dependent Schrödinger equation, 1D potential wells, and harmonic oscillators.',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Wave Functions, Probability Amplitudes & Schrödinger Equation',
					summary:
						'Learn quantum state postulates, complex wave function Psi(x,t), Born probability interpretation, and linear Hermitian operators.',
					pages: [
						{
							order: 1,
							heading: 'The Schrödinger Equation & Born Postulate',
							subheading: 'Governing the time-evolution of non-relativistic quantum states',
							body: "In quantum physics, physical state is described by wave function $\\Psi(x, t) \\in \\mathbb{C}$. The time-dependent Schrödinger equation reads:\n\n$$i\\hbar \\frac{\\partial}{\\partial t} \\Psi(x, t) = \\hat{H} \\Psi(x, t) = \\left( -\\frac{\\hbar^2}{2m} \\frac{\\partial^2}{\\partial x^2} + V(x, t) \\right) \\Psi(x, t)$$\n\nMax Born's statistical interpretation asserts that $|\\Psi(x, t)|^2 dx$ gives the probability of finding the particle in spatial interval $[x, x + dx]$, requiring normalization $\\int_{-\\infty}^{\\infty} |\\Psi(x, t)|^2 dx = 1$."
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'Quantum Operators & Born Postulate Quiz',
					summary:
						'Test concepts of wave function normalization, expectation values, and momentum operators.',
					questions: [
						{
							question:
								'What mathematical property must physical observable operators (such as position x and momentum p) satisfy in quantum mechanics?',
							options: [
								'They must be Nilpotent operators',
								'They must be Hermitian operators (self-adjoint) to yield real eigenvalues',
								'They must be non-invertible square matrices',
								'They must commute identically with all scalar constants'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'Physical observables must correspond to Hermitian operators because Hermitian operators guarantee real eigenvalues and orthogonal eigenvectors.'
						}
					]
				},
				{
					order: 3,
					type: 'lesson',
					title: '1D Potential Wells & The Quantum Harmonic Oscillator',
					summary:
						'Solve stationary states for infinite square wells, barrier penetration tunneling, and ladder creation/annihilation operators a and a_dagger.',
					pages: [
						{
							order: 1,
							heading: 'The Quantum Harmonic Oscillator & Ladder Operators',
							subheading: 'Algebraic solution using creation and annihilation operators',
							body: 'The Hamiltonian of a 1D harmonic oscillator with mass $m$ and frequency $\\omega$ is:\n\n$$\\hat{H} = \\frac{\\hat{p}^2}{2m} + \\frac{1}{2} m \\omega^2 \\hat{x}^2$$\n\nWe define dimensionless ladder operators annihilation $a$ and creation $a^\\dagger$:\n\n$$a = \\sqrt{\\frac{m\\omega}{2\\hbar}} \\left( \\hat{x} + \\frac{i\\hat{p}}{m\\omega} \\right), \\quad a^\\dagger = \\sqrt{\\frac{m\\omega}{2\\hbar}} \\left( \\hat{x} - \\frac{i\\hat{p}}{m\\omega} \\right)$$\n\nSatisfying commutator $[a, a^\\dagger] = 1$. The quantized energy levels are $E_n = \\hbar \\omega \\left(n + \\frac{1}{2}\\right)$ for $n = 0, 1, 2, \\dots$'
						}
					]
				},
				{
					order: 4,
					type: 'quiz',
					title: 'Harmonic Oscillator & Quantum Potentials Quiz',
					summary:
						'Test quantized energy levels, ground state zero-point energy, and ladder operator algebra.',
					questions: [
						{
							question:
								'What is the ground state energy E_0 of a 1D quantum harmonic oscillator with angular frequency omega?',
							options: ['0', '1/2 * hbar * omega', 'hbar * omega', '3/2 * hbar * omega'],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'Due to Heisenberg uncertainty principle, even in the ground state n=0 the zero-point energy is non-zero: E_0 = (1/2) hbar omega.'
						}
					]
				}
			]
		}
	},
	{
		id: 'history-modern-computing',
		courseId: 'history-computing',
		sharedByUid: 'chm-researcher',
		sharedByName: 'Computer History Museum Fellow',
		claimCount: 310,
		importCount: 310,
		isOfficial: true,
		tags: ['History', 'Programming'],
		level: 'beginner',
		revoked: false,
		snapshot: {
			title: 'History of Modern Computing & The Silicon Revolution',
			description:
				'From Babbage’s mechanical engines and Turing’s paper to ENIAC, the invention of the transistor, microprocessors, Xerox PARC, and the World Wide Web.',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Mechanical Origins & The Birth of Electronic Computing',
					summary:
						'Explore 19th-century mechanical tabulators, Ada Lovelace, Alan Turing’s theoretical model, Bletchley Park, and the von Neumann architecture.',
					pages: [
						{
							order: 1,
							heading: 'Pioneers of Computation: Lovelace, Babbage & Turing',
							subheading: 'From mechanical difference engines to universal computing machines',
							body: "In the 1830s, Charles Babbage designed the Analytical Engine, a mechanical general-purpose computer using punched cards. Ada Lovelace authored the first algorithm intended for execution on the machine, recognizing computation extended beyond numerical calculation to arbitrary symbols.\n\nIn 1936, Alan Turing introduced the mathematical model of the Universal Turing Machine. During World War II, Turing's work on the electromechanical Bombe at Bletchley Park broke Enigma ciphers, laying foundations for stored-program digital computers."
						},
						{
							order: 2,
							heading: 'ENIAC & The von Neumann Architecture',
							subheading: 'Unifying instructions and data in unified electronic memory',
							body: 'Completed in 1945 by J. Presper Eckert and John Mauchly at UPenn, ENIAC was the first programmable electronic general-purpose digital computer, utilizing 17,468 vacuum tubes.\n\nIn 1945, John von Neumann authored the *First Draft of a Report on the EDVAC*, establishing the **von Neumann Architecture** comprising: Central Processing Unit (ALU and Control Unit), Memory storing both instructions and data, Input/Output interfaces, and External Storage.'
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'Early Computing & Codebreaking Knowledge Check',
					summary:
						'Test knowledge of Babbage, Lovelace, vacuum tubes, and stored-program memory concepts.',
					questions: [
						{
							question:
								'What defining principle sets the von Neumann Architecture apart from earlier computing setups like ENIAC?',
							options: [
								'It relies entirely on optical lasers for calculation',
								'Both program instructions and operational data reside together in the same unified memory space',
								'It replaces binary logic with decimal gears',
								'It eliminates the need for an Arithmetic Logic Unit (ALU)'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'The von Neumann architecture introduced the stored-program concept, where executable program instructions share memory with data.'
						}
					]
				},
				{
					order: 3,
					type: 'lesson',
					title: 'The Transistor, Microprocessors & Personal Computing',
					summary:
						'Examine Bell Labs 1947 solid-state transistor, Intel 4004 microprocessor, Xerox PARC GUI, and the emergence of the global Internet.',
					pages: [
						{
							order: 1,
							heading: 'Bell Labs Transistor & Silicon Microprocessors',
							subheading: 'Replacing fragile vacuum tubes with solid-state semiconductors',
							body: "In 1947, John Bardeen, Walter Brattain, and William Shockley invented the point-contact transistor at Bell Labs. Solid-state semiconductors replaced power-hungry vacuum tubes, enabling drastic miniaturization.\n\nIn 1971, Intel released the **Intel 4004**, the first commercial single-chip microprocessor containing 2,300 transistors. Moore's Law famously observed that transistor counts on integrated circuits double approximately every two years."
						}
					]
				},
				{
					order: 4,
					type: 'quiz',
					title: 'Silicon Era & Microprocessor History Quiz',
					summary:
						'Assess understanding of solid-state electronics, Intel microprocessors, and Moore’s Law.',
					questions: [
						{
							question: 'What did Moore’s Law empirically predict regarding microchips?',
							options: [
								'Computer monitor resolution would double every 10 years',
								'The number of transistors on a microchip doubles roughly every two years',
								'Processor clock speed decreases by 50% each generation',
								'Memory prices remain constant regardless of manufacturing volume'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'Co-founder Gordon Moore noted in 1965 that the density of components per microchip doubled approximately every 2 years.'
						}
					]
				}
			]
		}
	},
	{
		id: 'sveltekit-modern-web',
		courseId: 'sveltekit-modern-web',
		sharedByUid: 'fullstack-dev-guild',
		sharedByName: 'Open Web Engineers Guild',
		claimCount: 185,
		importCount: 185,
		isOfficial: false,
		tags: ['Programming'],
		level: 'intermediate',
		revoked: false,
		snapshot: {
			title: 'Modern Web Engineering with SvelteKit & TypeScript',
			description:
				'Build modern full-stack web applications using Svelte 5 runes ($state, $derived, $effect), server endpoints, SSR, client-side routing, and type-safe forms.',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Svelte 5 Runes & Reactive State Management',
					summary:
						'Understand fine-grained reactivity in Svelte 5: $state(), $derived(), $effect(), and explicit signals without compiler magic tricks.',
					pages: [
						{
							order: 1,
							heading: 'Reactivity with Svelte 5 Runes',
							subheading: 'Universal reactive primitives in .svelte and .svelte.ts files',
							body: 'Svelte 5 replaces legacy `let count = 0;` assignments with explicit signal primitives called **Runes**.\n\n- `$state(initialValue)` declares a reactive state variable.\n- `$derived(expression)` computes derived values lazily and re-evaluates automatically when dependencies change.\n- `$effect(() => { ... })` schedules side-effects after DOM updates.\n\n```svelte\n<script lang="ts">\n\tlet count = $state(0);\n\tlet doubled = $derived(count * 2);\n</script>\n\n<button onclick={() => count++}>Count: {count} (Doubled: {doubled})</button>\n```'
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'Svelte 5 Runes Knowledge Check',
					summary: 'Test understanding of $state, $derived, and $effect behavior in Svelte 5.',
					questions: [
						{
							question:
								'Which Svelte 5 rune should be used to calculate a value dependent on another $state variable?',
							options: ['$state()', '$derived()', '$effect()', '$bind()'],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'$derived() creates a derived reactive signal that updates whenever any referenced state variable changes.'
						}
					]
				}
			]
		}
	},
	{
		id: 'neuroscience-learning',
		courseId: 'neuroscience-learning',
		sharedByUid: 'cog-sci-lab',
		sharedByName: 'Cognitive Science Institute',
		claimCount: 220,
		importCount: 220,
		isOfficial: false,
		tags: ['Science'],
		level: 'intermediate',
		revoked: false,
		snapshot: {
			title: 'Neuroscience of Learning, Memory & Brain Plasticity',
			description:
				'Explore the biological basis of learning: Long-Term Potentiation (LTP), dendritic spine growth, neuromodulators (dopamine/acetylcholine), and sleep consolidation.',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Synaptic Plasticity & Long-Term Potentiation (LTP)',
					summary:
						'Discover how high-frequency stimulation strengthens synaptic connections between neurons via NMDA receptor activation and AMPA receptor insertion.',
					pages: [
						{
							order: 1,
							heading: "Hebb's Postulate & Molecular LTP Mechanisms",
							subheading: 'Neurons that fire together wire together',
							body: 'Synaptic plasticity is the ability of synapses to strengthen or weaken over time in response to changes in activity. Donald Hebb proposed that simultaneous activation of presynaptic and postsynaptic neurons leads to increased synaptic efficiency.\n\nLong-Term Potentiation (LTP) in the hippocampus is mediated by glutamate receptors:\n1. AMPA receptors depolarize the postsynaptic membrane.\n2. Depolarization expels the $Mg^{2+}$ block from NMDA receptor channels.\n3. $Ca^{2+}$ influx triggers intracellular signaling cascades (CaMKII), inserting additional AMPA receptors into the postsynaptic membrane.'
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'Synaptic Mechanisms & Neurobiology Quiz',
					summary:
						'Test concepts of neurotransmitters, LTP, and memory formation in the hippocampus.',
					questions: [
						{
							question:
								'What unblocks the NMDA receptor channel to allow Ca2+ influx during LTP induction?',
							options: [
								'Serotonin reuptake inhibition',
								'Postsynaptic membrane depolarization removing the Mg2+ ion plug',
								'Breakdown of myelin sheath around axons',
								'Activation of GABAergic inhibitory interneurons'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'Strong membrane depolarization removes the voltage-dependent Mg2+ block from the NMDA receptor pore, allowing calcium entry.'
						}
					]
				}
			]
		}
	},
	{
		id: 'applied-multivariable-calculus',
		courseId: 'applied-multivariable-calculus',
		sharedByUid: 'math-ocw-group',
		sharedByName: 'Applied Math Courseware Collective',
		claimCount: 160,
		importCount: 160,
		isOfficial: false,
		tags: ['Math'],
		level: 'intermediate',
		revoked: false,
		snapshot: {
			title: 'Applied Calculus & Multivariable Gradient Optimization',
			description:
				'A mathematical guide to multi-variable functions, partial derivatives, gradient vector fields, directional derivatives, and Lagrange multipliers.',
			format: 'lessons_and_quizzes',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Partial Derivatives, Gradient Fields & Steepest Ascent',
					summary:
						'Master multivariable differentiation: tangent planes, partial derivatives df/dx, and gradient vector nabla f.',
					pages: [
						{
							order: 1,
							heading: 'The Gradient Vector & Directional Derivatives',
							subheading: 'Navigating scalar fields in higher dimensions',
							body: 'For a scalar function $f(x, y, z): \\mathbb{R}^3 \\rightarrow \\mathbb{R}$, the **Gradient Vector** $\\nabla f$ collects all first-order partial derivatives:\n\n$$\\nabla f = \\left( \\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y}, \\frac{\\partial f}{\\partial z} \\right)$$\n\nGeometric properties of $\\nabla f(p)$:\n1. Points in the direction of maximum rate of increase of $f$ at point $p$.\n2. Magnitude $|\\nabla f(p)|$ equals that maximum rate of increase.\n3. $\\nabla f(p)$ is perpendicular to the level surface $f(x, y, z) = c$ passing through $p$.'
						}
					]
				},
				{
					order: 2,
					type: 'quiz',
					title: 'Gradient Vector & Multi-Variable Calculus Quiz',
					summary:
						'Assess understanding of directional derivatives, gradients, and level surfaces.',
					questions: [
						{
							question:
								'In what direction relative to a function level curve f(x, y) = c does the gradient vector nabla f point?',
							options: [
								'Parallel to the level curve tangent line',
								'Perpendicular (orthogonal) to the level curve',
								'Opposite to the vector origin (0, 0)',
								'In the direction where the function value remains constant'
							],
							correctIndex: 1,
							answerIndex: 1,
							explanation:
								'The gradient vector nabla f is always orthogonal (perpendicular) to the level curve or level surface at any given point.'
						}
					]
				}
			]
		}
	}
];

async function seedSharedCourses() {
	console.log('Seeding shared courses into Firestore...');
	const colRef = db.collection('sharedCourses');

	for (const courseData of COMMUNITY_COURSES) {
		const docRef = colRef.doc(courseData.id);
		await docRef.set(
			{
				...courseData,
				createdAt: FieldValue.serverTimestamp()
			},
			{ merge: true }
		);
		console.log(
			`✓ Successfully seeded shared course: [${courseData.id}] "${courseData.snapshot.title}"`
		);
	}

	console.log('\nAll community courses seeded successfully!');
	process.exit(0);
}

seedSharedCourses().catch((err) => {
	console.error('Failed to seed shared courses:', err);
	process.exit(1);
});
