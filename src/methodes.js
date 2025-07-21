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
    const finalResult = [];

    Object.values(groupedByDate).forEach(segments => {
        let validSegment = null;
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
    });
    return finalResult;
}

export function filterCalculateBed(dailyBedUsage, calculatedBed) {
    const allSegments = dailyBedUsage;

    // Deep copy to avoid mutating original
    const copiedResult = calculatedBed.map(row => ({ ...row }));
    let filteredResult = copiedResult.filter(row => row.bed_count !== 0);
    const total_bed_count = filteredResult.reduce((sum, row) => sum + row.bed_count, 0);

    if(total_bed_count > 1){
        const firstSegment = allSegments[0];
        const lastSegment = allSegments[allSegments.length - 1];

        const firstSegment_hour = firstSegment.raw_start.getHours();
        const firstSegment_min = firstSegment.raw_start.getMinutes();
        const firstSegment_totalMinutes = firstSegment_hour * 60 + firstSegment_min;

        let firstSegment_bedCount = 0;
        if (firstSegment_totalMinutes < 360) firstSegment_bedCount = 1; // before 6:00 AM
        else if (firstSegment_totalMinutes >= 360 && firstSegment_totalMinutes < 540) firstSegment_bedCount = 0.5; // 6–9 AM
        else if (firstSegment_totalMinutes >= 540 && firstSegment_totalMinutes < 720) firstSegment_bedCount = 0; // 9–12 PM


        const lastSegment_hour = lastSegment.raw_end.getHours();
        const lastSegment_min = lastSegment.raw_end.getMinutes();
        const lastSegment_totalMinutes = lastSegment_hour * 60 + lastSegment_min;

        let lastSegment_bedCount = 1;
        if (lastSegment_totalMinutes > 720 && lastSegment_totalMinutes <= 900) lastSegment_bedCount = 0; // 12–3 PM (grace)
        else if (lastSegment_totalMinutes > 900 && lastSegment_totalMinutes <= 1080) lastSegment_bedCount = 0.5; // 3–6 PM
        else lastSegment_bedCount = 1; // after 6 PM

        if(total_bed_count > 2){
            filteredResult[0].bed_count = firstSegment_bedCount
            filteredResult[filteredResult.length - 1].bed_count = lastSegment_bedCount
        }else{
            if(firstSegment_bedCount == 0 && lastSegment_bedCount == 0){
                filteredResult[filteredResult.length - 1].bed_count = 0;
            }else if(firstSegment_bedCount < 1 && lastSegment_bedCount < 1 ){
                filteredResult[filteredResult.length - 1].bed_count = 0;
            }else{
                filteredResult[0].bed_count = firstSegment_bedCount
                filteredResult[filteredResult.length - 1].bed_count = lastSegment_bedCount
            }
        }

    }


    
    filteredResult = filteredResult.map(row => ({
        ...row,
        bed_charge: +(row.bed_rent * row.bed_count).toFixed(2)
    }));


    return filteredResult;
}


export function calculateBed2(dailyBedUsage, groupedByDate) {
    const allSegments = dailyBedUsage;
    
    const firstSegmentId = `${allSegments[0].bed_name}_${allSegments[0].start_time}_${allSegments[0].end_time}`;
    const lastSegmentId = `${allSegments[allSegments.length - 1].bed_name}_${allSegments[allSegments.length - 1].start_time}_${allSegments[allSegments.length - 1].end_time}`;

    const finalResult = [];

    Object.values(groupedByDate).forEach(segments => {
        let validSegment = null;

        segments.forEach(seg => {
            let bedCount = 0;
            const segId = `${seg.bed_name}_${seg.start_time}_${seg.end_time}`;

            if (segId === firstSegmentId) {
                const hour = seg.raw_start.getHours();
                const min = seg.raw_start.getMinutes();
                const totalMinutes = hour * 60 + min;

                if (totalMinutes < 360) bedCount = 1; // before 6:00 AM
                else if (totalMinutes < 540) bedCount = 0.5; // 6–9 AM
                else if (totalMinutes < 720) bedCount = 0; // 9–12 PM
                else {
                    if (seg.hour >= 6) bedCount = 1;
                    else if (seg.hour >= 3) bedCount = 0.5;
                    else bedCount = 0;
                }
            } 
            else if (segId === lastSegmentId) {
                const hour = seg.raw_end.getHours();
                const min = seg.raw_end.getMinutes();
                const totalMinutes = hour * 60 + min;

                if (totalMinutes <= 720) bedCount = 0; // before 12:00 PM
                else if (totalMinutes <= 900) bedCount = 0; // 12–3 PM (grace)
                else if (totalMinutes <= 1080) bedCount = 0.5; // 3–6 PM
                else bedCount = 1; // after 6 PM
            }

            finalResult.push({
                ...seg,
                bed_count: bedCount,
                bed_charge: +(seg.bed_rent * bedCount).toFixed(2)
            });
        });

        // Middle segments (not first or last day)
        const nonEdgeSegments = segments.filter(seg => {
            const segId = `${seg.bed_name}_${seg.start_time}_${seg.end_time}`;
            return segId !== firstSegmentId && segId !== lastSegmentId;
        });

        if (nonEdgeSegments.length > 0) {
            const candidates = nonEdgeSegments.filter(s => s.hour >= 3);
            const validSegment = candidates.length > 0
                ? candidates.reduce((max, seg) => seg.bed_rent > max.bed_rent ? seg : max)
                : nonEdgeSegments[0];

            const validSegId = `${validSegment.bed_name}_${validSegment.start_time}_${validSegment.end_time}`;

            nonEdgeSegments.forEach(seg => {
                const segId = `${seg.bed_name}_${seg.start_time}_${seg.end_time}`;
                const bedCount = segId === validSegId ? 1 : 0;

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
