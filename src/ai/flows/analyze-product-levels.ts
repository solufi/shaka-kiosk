'use server';

/**
 * @fileOverview An AI agent to analyze product levels in a vending machine from an image.
 *
 * - analyzeProductLevels - A function that analyzes product levels and determines if a refill is needed.
 * - AnalyzeProductLevelsInput - The input type for the analyzeProductLevels function.
 * - AnalyzeProductLevelsOutput - The return type for the analyzeProductLevels function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeProductLevelsInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of the vending machine's interior, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
});
export type AnalyzeProductLevelsInput = z.infer<typeof AnalyzeProductLevelsInputSchema>;

const AnalyzeProductLevelsOutputSchema = z.object({
  needsRefill: z.boolean().describe('Whether or not the vending machine needs a refill.'),
  productLevels: z
    .record(z.string(), z.number())
    .describe('A map of product names to their remaining quantities.'),
  analysis: z.string().describe('A detailed analysis of the product levels in the vending machine.'),
});
export type AnalyzeProductLevelsOutput = z.infer<typeof AnalyzeProductLevelsOutputSchema>;

export async function analyzeProductLevels(
  input: AnalyzeProductLevelsInput
): Promise<AnalyzeProductLevelsOutput> {
  return analyzeProductLevelsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeProductLevelsPrompt',
  input: {schema: AnalyzeProductLevelsInputSchema},
  output: {schema: AnalyzeProductLevelsOutputSchema},
  prompt: `You are an expert vending machine inventory analyst.

You will analyze the provided image of the vending machine interior and determine the quantity of each product remaining.

Based on the product levels, you will determine if a refill is needed. If any product is below 20% capacity, the vending machine needs a refill.

Here is the image of the vending machine interior: {{media url=photoDataUri}}

Respond in JSON format with the following schema: ${JSON.stringify(AnalyzeProductLevelsOutputSchema.shape)}.
`,
});

const analyzeProductLevelsFlow = ai.defineFlow(
  {
    name: 'analyzeProductLevelsFlow',
    inputSchema: AnalyzeProductLevelsInputSchema,
    outputSchema: AnalyzeProductLevelsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
