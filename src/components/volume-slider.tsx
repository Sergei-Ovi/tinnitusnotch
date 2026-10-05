import {store} from '@/app/store';
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack, SliderValueLabel} from '@/components/ui/slider';
import {t} from '@/i18n';

export function VolumeSlider() {
	return (
		<Slider class="space-y-3" minValue={0} maxValue={100} value={[store.volume()]}
		        getValueLabel={({values}) => `${values[0]}%`}
		        onChange={([value]) => store.setVolume(value)}>
			<div class="flex w-full justify-between">
				<SliderLabel>{t().common.volume}</SliderLabel>
				<SliderValueLabel/>
			</div>
			<SliderTrack>
				<SliderFill/>
				<SliderThumb/>
			</SliderTrack>
		</Slider>
	);
}
