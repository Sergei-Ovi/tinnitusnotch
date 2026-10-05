import {Button} from '@/components/ui/button';
import {t} from '@/i18n';
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
				<div class="grid grid-cols-11 gap-1" role="group" aria-label={t().rating.scale}>
					<For each={SCALE}>{value =>
						<Button variant="outline" size="sm" class="px-0" onClick={() => props.onAnswer(value)}>
							{value}
						</Button>
					}</For>
				</div>
				<div class="flex justify-between text-xs text-muted-foreground">
					<span>{t().rating.low}</span>
					<span>{t().rating.high}</span>
				</div>
			</CardContent>
			<CardFooter class="gap-2">
				<Show when={props.onCancel}>
					<Button variant="ghost" onClick={() => props.onCancel?.()}>{t().common.cancel}</Button>
				</Show>
				<Button variant="secondary" class="ml-auto" onClick={() => props.onAnswer(null)}>{t().common.skip}</Button>
			</CardFooter>
		</Card>
	);
}
