'use server';

/**
 * @fileOverview An AI agent to analyze product stock levels in a vending machine from an image.
 *
 * - analyzeStockLevel - A function that analyzes stock levels and determines if a refill is needed.
 * - AnalyzeStockLevelInput - The input type for the analyzeStockLevel function.
 * - AnalyzeStockLevelOutput - The return type for the analyzeStockLevel function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeStockLevelInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of the vending machine's interior, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
});
export type AnalyzeStockLevelInput = z.infer<typeof AnalyzeStockLevelInputSchema>;

const AnalyzeStockLevelOutputSchema = z.object({
  needsRefill: z.boolean().describe('Indique si le distributeur automatique a besoin d\'être rechargé.'),
  productLevels: z
    .record(z.string(), z.number())
    .describe('Une carte des noms de produits et de leurs quantités restantes.'),
  maintenanceRequired: z
    .boolean()
    .describe('Indique si le distributeur automatique nécessite une maintenance.'),
  analysis:
    z.string().describe('Une analyse détaillée des niveaux de stock et de l\'état de la machine.'),
});
export type AnalyzeStockLevelOutput = z.infer<typeof AnalyzeStockLevelOutputSchema>;

export async function analyzeStockLevel(
  input: AnalyzeStockLevelInput
): Promise<AnalyzeStockLevelOutput> {
  return analyzeStockLevelFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeStockLevelPrompt',
  input: {schema: AnalyzeStockLevelInputSchema},
  output: {schema: AnalyzeStockLevelOutputSchema},
  prompt: `Vous êtes un expert analyste d'inventaire de distributeurs automatiques.

Vous analyserez l'image fournie de l'intérieur du distributeur et déterminerez la quantité restante de chaque produit.

En fonction des niveaux de produits, vous déterminerez si un remplissage est nécessaire. Si un produit est en dessous de 20% de sa capacité, le distributeur a besoin d'un remplissage.

Vous rechercherez également tout signe de dommage ou de dysfonctionnement dans le distributeur automatique, tel que des déversements, des pièces cassées ou des messages d'erreur sur l'écran.

Voici l'image de l'intérieur du distributeur automatique: {{media url=photoDataUri}}

Répondez en format JSON avec le schéma suivant: ${JSON.stringify(
    AnalyzeStockLevelOutputSchema.shape
  )}.
`,
});

const analyzeStockLevelFlow = ai.defineFlow(
  {
    name: 'analyzeStockLevelFlow',
    inputSchema: AnalyzeStockLevelInputSchema,
    outputSchema: AnalyzeStockLevelOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
