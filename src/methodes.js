export function splitToHospitalDays(bedInfo) {

    const result = [];
    
    // Date formater function
    function formatDateDDMMYYYY(date) {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    bedInfo.forEach(row => {
        const startDate = new Date(row['start_date']);
        const endDate = new Date(row['end_date']);

        let currentDayStart = new Date(startDate);
        currentDayStart.setHours(12, 0, 0, 0); // hospital day starts at 12:00 PM

        if (startDate < currentDayStart) {
            currentDayStart.setDate(currentDayStart.getDate() - 1);
        }

        while (currentDayStart < endDate) {
            const nextDayEnd = new Date(currentDayStart);
            nextDayEnd.setDate(nextDayEnd.getDate() + 1);
            nextDayEnd.setHours(11, 59, 0, 0); // hospital day ends at 11:59 AM

            const segmentStart = new Date(Math.max(startDate, currentDayStart));
            const segmentEnd = new Date(Math.min(endDate, nextDayEnd));
            const hoursStayed = (
                (segmentEnd - segmentStart) / (1000 * 60 * 60)
            ).toFixed(2);

            result.push({
                date: formatDateDDMMYYYY(currentDayStart),
                bed_category: row['bed_category'],
                bed_name: row['bed_name'],
                bed_rent: row.bed_rent,
                start_time: segmentStart.toTimeString().slice(0, 5),
                end_time: segmentEnd.toTimeString().slice(0, 5),
                hour: parseFloat(hoursStayed),
                raw_start: segmentStart,
                raw_end: segmentEnd
            });

            currentDayStart.setDate(currentDayStart.getDate() + 1);
        }
    });

    return result;
}

export function groupByDate(dailyBedUsage) {
    const groupedByDate = {};

    dailyBedUsage.forEach(item => {
        if (!groupedByDate[item.date]) {
            groupedByDate[item.date] = [];
        }
        groupedByDate[item.date].push(item);
    });

    return groupedByDate;
}

export function calculateBed(dailyBedUsage, groupedByDate) {
    const allSegments = dailyBedUsage;
    const firstSegment = allSegments[0];
    const lastSegment = allSegments[allSegments.length - 1];

    const finalResult = [];

    Object.values(groupedByDate).forEach(segments => {
        let validSegment = null;

         if (segments.includes(firstSegment) || segments.includes(lastSegment)) {
            segments.forEach(seg => {
                let bedCount = 0;

                if (seg === firstSegment) {
                    const hour = seg.raw_start.getHours();
                    const min = seg.raw_start.getMinutes();
                    const totalMinutes = hour * 60 + min;

                    if (totalMinutes < 360) bedCount = 1; // before 6:00 AM
                    else if (totalMinutes >= 360 && totalMinutes < 540) bedCount = 0.5; // 6–9 AM
                    else if (totalMinutes >= 540 && totalMinutes < 720) bedCount = 0; // 9–12 PM
                    else {
                        if (seg.hour >= 6) bedCount = 1;
                        else if (seg.hour >= 3) bedCount = 0.5;
                        else bedCount = 0;
                    }
                }
                else if (seg === lastSegment) {
                    const hour = seg.raw_end.getHours();
                    const min = seg.raw_end.getMinutes();
                    const totalMinutes = hour * 60 + min;

                    if (totalMinutes <= 720) bedCount = 0; // before 12:00 PM
                    else if (totalMinutes > 720 && totalMinutes <= 900) bedCount = 0; // 12–3 PM (grace)
                    else if (totalMinutes > 900 && totalMinutes <= 1080) bedCount = 0.5; // 3–6 PM
                    else bedCount = 1; // after 6 PM
                    
                    if(stayHour > hour){
                        bedCount = 1;
                    }
                }

                finalResult.push({
                    ...seg,
                    bed_count: bedCount,
                    bed_charge: +(seg.bed_rent * bedCount).toFixed(2)
                });
            });
        } else {
            const candidates = segments.filter(s => s.hour >= 3);
            validSegment = candidates.length > 0
                ? candidates.reduce((max, seg) => seg.bed_rent > max.bed_rent ? seg : max)
                : segments[0];

            segments.forEach(seg => {
                const bedCount = seg === validSegment ? 1 : 0;
                finalResult.push({
                    ...seg,
                    bed_count: bedCount,
                    bed_charge: +(seg.bed_rent * bedCount).toFixed(2)
                });
            });
        }
    });
    return finalResult;
}
