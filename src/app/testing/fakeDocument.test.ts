import { describe, expect, it } from 'vitest';
import { createFakeDocument, oneByClass } from './fakeDocument';

describe('oneByClass', () => {
	it('finds the one element with the class, itself included', () => {
		const { createElement } = createFakeDocument();
		const root = createElement('div');
		const child = createElement('span');
		child.className = 'mark';
		root.append(child);
		expect(oneByClass(root, 'mark')).toBe(child);
	});

	it('refuses none, and more than one', () => {
		const { createElement } = createFakeDocument();
		const root = createElement('div');
		expect(() => oneByClass(root, 'mark')).toThrow('found 0');
		for (let i = 0; i < 2; i++) {
			const child = createElement('span');
			child.classList.add('mark');
			root.append(child);
		}
		expect(() => oneByClass(root, 'mark')).toThrow('found 2');
	});
});
