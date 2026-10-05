import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import type {Rating} from '@/lib/therapy/session';
import {For, type JSX, Show} from 'solid-js';

const SCALE = Array.from({length: 11}, (_, i) => i);

/** "How loud is your tinnitus?" on a 0–10 scale; answering is optional. */
export function RatingPrompt(props: {
	title: string;
	description?: JSX.Element;
	onAnswer: (rating: Rating) => void;
	onCancel?: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{props.title}</CardTitle>
				<CardDescription>{props.description}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-2">
				<div class="grid grid-cols-11 gap-1" role="group" aria-label="Tinnitus loudness, 0 to 10">
					<For each={SCALE}>{value =>
						<Button variant="outline" size="sm" class="px-0" onClick={() => props.onAnswer(value)}>
							{value}
						</Button>
					}</For>
				</div>
				<div class="flex justify-between text-xs text-muted-foreground">
					<span>0 — not audible</span>
					<span>10 — as loud as it gets</span>
				</div>
			</CardContent>
			<CardFooter class="gap-2">
				<Show when={props.onCancel}>
					<Button variant="ghost" onClick={() => props.onCancel?.()}>Cancel</Button>
				</Show>
				<Button variant="secondary" class="ml-auto" onClick={() => props.onAnswer(null)}>Skip</Button>
			</CardFooter>
		</Card>
	);
}
